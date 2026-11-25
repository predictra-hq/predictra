-- ADR 0071: soglie dell'agente adatte ai tre giri al giorno, notifiche cancellabili,
-- un messaggio alla volta nello Spogliatoio, nomi nelle reazioni, quote valide 24 ore.

-- 1. Agente su GitHub Actions: tre giri al giorno (6:50, 15:50, 22:50 UTC), fino a 9 ore
--    tra due giri. Con la soglia di 6 ore il controllo segnalava «Agente degradato» ogni
--    notte e ogni mattina anche con tutti i giri riusciti. Ora: atteso ogni 8 ore,
--    degradato dopo 11 ore senza un giro riuscito.
create or replace view public.v_agent_status
with (security_invoker = true) as
with expected (source, expected_interval_minutes, degraded_after_minutes) as (
  values ('qstash'::public.agent_run_source, 15, 45),
         ('github_actions'::public.agent_run_source, 480, 660)
),
recent as (
  select r.source,
         count(*) as runs_24h,
         count(*) filter (where r.status = 'failed') as failed_runs_24h,
         min(r.started_at) as first_started,
         max(r.started_at) as last_started
  from public.agent_runs r
  where r.started_at >= now() - interval '24 hours'
  group by r.source
)
select
  e.source,
  e.expected_interval_minutes,
  e.degraded_after_minutes,
  last_run.started_at as last_run_at,
  last_run.status as last_run_status,
  last_ok.finished_at as last_success_at,
  coalesce(rc.runs_24h, 0)::integer as runs_24h,
  coalesce(rc.failed_runs_24h, 0)::integer as failed_runs_24h,
  case when rc.runs_24h > 1
       then round((extract(epoch from rc.last_started - rc.first_started) / 60 / (rc.runs_24h - 1))::numeric, 1)
  end as observed_interval_minutes,
  (last_ok.finished_at is null
   or last_ok.finished_at < now() - make_interval(mins => e.degraded_after_minutes)) as is_degraded
from expected e
left join recent rc on rc.source = e.source
left join lateral (
  select r.started_at, r.status from public.agent_runs r
  where r.source = e.source order by r.started_at desc, r.id desc limit 1
) last_run on true
left join lateral (
  select r.finished_at from public.agent_runs r
  where r.source = e.source and r.status in ('succeeded', 'partial')
  order by r.finished_at desc, r.id desc limit 1
) last_ok on true;

-- 2. Notifiche: ognuno può cancellare le proprie dalla Home.
grant delete on public.notifications to authenticated;
create policy notifications_owner_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid() and (select app_private.is_active_user()));

-- 3. Spogliatoio: un messaggio alla volta. Dopo un messaggio si aspetta 2 minuti prima
--    del successivo (errore POST_COOLDOWN); resta il limite di 10 in 5 minuti.
create or replace function app_private.check_community_posts_rate()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.community_posts c
             where c.user_id = new.user_id and c.created_at > now() - interval '2 minutes') then
    raise exception 'POST_COOLDOWN' using errcode = 'P0001';
  end if;
  if (select count(*) from public.community_posts c
      where c.user_id = new.user_id and c.created_at > now() - interval '5 minutes') >= 10 then
    raise exception 'COMMENT_RATE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- 4. Reazioni con i nomi di chi le ha messe (si vedono passando sopra l'emoji).
create or replace function public.community_feed(p_channel text, p_limit integer default 50)
returns table (
  id bigint,
  channel text,
  body text,
  slip jsonb,
  created_at timestamptz,
  author_name text,
  name_color text,
  name_style text,
  avatar_style text,
  is_own boolean,
  reactions jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_active_user() then
    return;
  end if;
  return query
    select c.id, c.channel, c.body, c.slip, c.created_at, coalesce(p.display_name, 'Utente'),
           p.name_color, p.name_style, p.avatar_style, c.user_id = auth.uid(),
           coalesce((
             select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.n, 'mine', r.mine,
                                                 'names', r.names)
                              order by r.n desc, r.emoji)
             from (
               select x.emoji, count(*)::int n, bool_or(x.user_id = auth.uid()) mine,
                      jsonb_agg(coalesce(rp.display_name, 'Utente') order by x.created_at) names
               from public.community_reactions x
               join public.profiles rp on rp.id = x.user_id and rp.status = 'ACTIVE'
               where x.post_id = c.id
               group by x.emoji
             ) r
           ), '[]'::jsonb)
    from public.community_posts c
    join public.profiles p on p.id = c.user_id
    where c.channel = p_channel
      and p.status = 'ACTIVE'
    order by c.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- 5. Quote: la raccolta completa è una volta al giorno, quindi valgono 24 ore (più un
--    margine): prima risultavano «non aggiornate» dopo 12 ore, ogni pomeriggio.
update public.source_freshness_rules
set max_age = interval '26 hours'
where provider = 'the-odds-api' and data_kind = 'odds';
