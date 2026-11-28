-- Spogliatoio in tempo reale, ruolo degli amministratori accanto al nome e feedback
-- degli iscritti (ADR 0081).

-- -----------------------------------------------------------------------------
-- 1. Tempo reale: un avviso senza contenuto a ogni messaggio, reazione o commento
-- -----------------------------------------------------------------------------
-- I trigger mandano «qualcosa è cambiato» (`changed`) su un canale Broadcast privato di
-- Supabase Realtime, mai testo, nomi o id. Chi è collegato ricarica la chat con
-- `community_feed`, che applica le solite regole. Se Realtime non risponde, il messaggio
-- si salva lo stesso.
create function app_private.notify_community_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_topic text;
begin
  if tg_table_name = 'community_posts' then
    v_topic := 'community:' || lower(coalesce(new.channel, old.channel));
  elsif tg_table_name = 'community_reactions' then
    select 'community:' || lower(c.channel) into v_topic
    from public.community_posts c where c.id = coalesce(new.post_id, old.post_id);
  else
    v_topic := 'community:matches';
  end if;
  if v_topic is not null then
    begin
      perform realtime.send(jsonb_build_object('kind', tg_table_name), 'changed', v_topic, true);
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;
revoke execute on function app_private.notify_community_change() from public, anon, authenticated;

create trigger community_posts_live after insert or delete on public.community_posts
  for each row execute function app_private.notify_community_change();
create trigger community_reactions_live after insert or delete on public.community_reactions
  for each row execute function app_private.notify_community_change();
create trigger match_comments_live after insert or delete on public.match_comments
  for each row execute function app_private.notify_community_change();

-- Ascoltano i canali dello Spogliatoio solo gli iscritti attivi (canali privati).
create policy community_live_read on realtime.messages for select to authenticated
  using (
    realtime.topic() in ('community:general', 'community:slips', 'community:matches')
    and (select app_private.is_active_user())
  );

-- -----------------------------------------------------------------------------
-- 2. Ruolo accanto al nome: solo Admin e Super Admin
-- -----------------------------------------------------------------------------
-- `author_role` vale ADMIN o SUPER_ADMIN (il più alto dei due), altrimenti null: il ruolo
-- degli altri iscritti non si espone.
drop function public.community_feed(text, integer);
create function public.community_feed(p_channel text, p_limit integer default 50)
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
  reactions jsonb,
  author_role text
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
           ), '[]'::jsonb),
           (select ur.role::text
            from public.user_roles ur
            join public.roles ro on ro.code = ur.role
            where ur.user_id = c.user_id and ur.role in ('ADMIN', 'SUPER_ADMIN')
            order by ro.rank desc
            limit 1)
    from public.community_posts c
    join public.profiles p on p.id = c.user_id
    where c.channel = p_channel
      and p.status = 'ACTIVE'
    order by c.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;
revoke execute on function public.community_feed(text, integer) from public, anon;
grant execute on function public.community_feed(text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Feedback degli iscritti
-- -----------------------------------------------------------------------------
-- Un'idea, un problema o un apprezzamento. Lo scrive l'iscritto, che rivede solo i propri;
-- gli amministratori li leggono con `admin_feedback_list` (sessione con 2FA). Niente email:
-- la piattaforma non ne invia.
create table public.feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('IDEA', 'PROBLEM', 'PRAISE', 'OTHER')),
  body        text not null check (char_length(btrim(body)) between 3 and 1000),
  -- Pagina di partenza: solo un percorso interno (mai `//sito` o un indirizzo esterno).
  page        text check (
                page is null
                or (char_length(page) <= 200 and page ~ '^/([^/[:space:]][^[:space:]]*)?$')
              ),
  created_at  timestamptz not null default now()
);
create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_user_idx on public.feedback (user_id, created_at desc);

create function app_private.check_feedback_rate()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.feedback f
      where f.user_id = new.user_id and f.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'FEEDBACK_RATE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.check_feedback_rate() from public, anon, authenticated;
create trigger feedback_rate before insert on public.feedback
  for each row execute function app_private.check_feedback_rate();

alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;
grant select, insert on public.feedback to authenticated;
grant all on public.feedback to service_role;

create policy feedback_owner on public.feedback for all to authenticated
  using (user_id = auth.uid() and (select app_private.is_active_user()))
  with check (user_id = auth.uid() and (select app_private.is_active_user()));

create function public.admin_feedback_list(p_limit integer default 100)
returns table (
  id bigint,
  kind text,
  body text,
  page text,
  created_at timestamptz,
  author_name text,
  author_email text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.assert_admin_session();
  return query
    select f.id, f.kind, f.body, f.page, f.created_at, coalesce(p.display_name, 'Utente'), p.email
    from public.feedback f
    join public.profiles p on p.id = f.user_id
    order by f.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke execute on function public.admin_feedback_list(integer) from public, anon;
grant execute on function public.admin_feedback_list(integer) to authenticated;
