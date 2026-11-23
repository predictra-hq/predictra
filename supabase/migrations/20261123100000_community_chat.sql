-- =============================================================================
-- PREDICTRA — M8: comunità con più chat, schedine condivise, niente data di nascita
-- =============================================================================
-- Decisione: docs/decisions/0064-comunita-chat-e-schedine-condivise.md
--
--  1. PREDICTRA è solo per maggiorenni scelti dagli amministratori (accesso su invito):
--     la data di nascita non serve più per scrivere. `is_adult_user()` diventa vera per
--     ogni utente attivo; la tabella `user_birthdays` resta (dati già inseriti), senza uso.
--  2. Le immagini del profilo si vedono accanto al nome anche nelle chat: i feed
--     restituiscono anche `avatar_style`.
--  3. `community_posts`: messaggi nelle chat della comunità, `GENERAL` (generale) e `SLIPS`
--     (schedine condivise, con il riepilogo della schedina). Le partite hanno già i loro
--     commenti (`match_comments`). Stesse regole: solo utenti attivi, 500 caratteri, al più
--     10 messaggi in 5 minuti, si cancella il proprio, moderazione con 2FA registrata.
-- =============================================================================

create or replace function app_private.is_adult_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app_private.is_active_user();
$$;

-- Feed dei commenti con l'immagine del profilo (cambia il tipo restituito: si ricreano).
drop function public.match_comment_feed(bigint);
create function public.match_comment_feed(p_match_id bigint)
returns table (
  id bigint,
  body text,
  created_at timestamptz,
  author_name text,
  name_color text,
  name_style text,
  avatar_style text,
  is_own boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_active_user() then
    return;
  end if;
  return query
    select c.id, c.body, c.created_at, coalesce(p.display_name, 'Utente'),
           p.name_color, p.name_style, p.avatar_style, c.user_id = auth.uid()
    from public.match_comments c
    join public.profiles p on p.id = c.user_id
    where c.match_id = p_match_id
      and p.status = 'ACTIVE'
    order by c.created_at desc
    limit 200;
end;
$$;
revoke execute on function public.match_comment_feed(bigint) from public, anon;
grant execute on function public.match_comment_feed(bigint) to authenticated;

drop function public.recent_comment_feed(integer);
create function public.recent_comment_feed(p_limit integer default 50)
returns table (
  id bigint,
  match_id bigint,
  home_team text,
  away_team text,
  kickoff_at timestamptz,
  body text,
  created_at timestamptz,
  author_name text,
  name_color text,
  name_style text,
  avatar_style text,
  is_own boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_active_user() then
    return;
  end if;
  return query
    select c.id, c.match_id, ht.name, at.name, m.kickoff_at, c.body, c.created_at,
           coalesce(p.display_name, 'Utente'), p.name_color, p.name_style, p.avatar_style,
           c.user_id = auth.uid()
    from public.match_comments c
    join public.profiles p on p.id = c.user_id
    join public.matches m on m.id = c.match_id
    join public.teams ht on ht.id = m.home_team_id
    join public.teams at on at.id = m.away_team_id
    where p.status = 'ACTIVE'
    order by c.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;
revoke execute on function public.recent_comment_feed(integer) from public, anon;
grant execute on function public.recent_comment_feed(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Messaggi delle chat della comunità
-- -----------------------------------------------------------------------------
create table public.community_posts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  channel     text not null check (channel in ('GENERAL', 'SLIPS')),
  body        text not null default '' check (char_length(body) <= 500),
  -- Riepilogo di una schedina condivisa (titolo, selezioni, quota, probabilità): solo
  -- testo mostrato, mai usato per calcoli. Al più 4 KB.
  slip        jsonb check (slip is null or (jsonb_typeof(slip) = 'object' and pg_column_size(slip) <= 4096)),
  created_at  timestamptz not null default now(),
  constraint community_posts_content check (char_length(btrim(body)) > 0 or slip is not null),
  constraint community_posts_slip_channel check (slip is null or channel = 'SLIPS')
);
create index community_posts_channel_idx on public.community_posts (channel, created_at desc);
create index community_posts_user_idx on public.community_posts (user_id, created_at desc);

create function app_private.check_community_posts_rate()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.community_posts c
      where c.user_id = new.user_id and c.created_at > now() - interval '5 minutes') >= 10 then
    raise exception 'COMMENT_RATE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.check_community_posts_rate() from public, anon, authenticated;

create trigger community_posts_rate before insert on public.community_posts
  for each row execute function app_private.check_community_posts_rate();

alter table public.community_posts enable row level security;
revoke all on public.community_posts from public, anon, authenticated;
grant select, insert, delete on public.community_posts to authenticated;
grant all on public.community_posts to service_role;

-- Dalla tabella ognuno vede e cancella solo i propri; gli altri si leggono dal feed.
create policy community_posts_owner on public.community_posts for all to authenticated
  using (user_id = auth.uid() and (select app_private.is_active_user()))
  with check (user_id = auth.uid() and (select app_private.is_active_user()));

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
  is_own boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_active_user() then
    return;
  end if;
  return query
    select c.id, c.channel, c.body, c.slip, c.created_at, coalesce(p.display_name, 'Utente'),
           p.name_color, p.name_style, p.avatar_style, c.user_id = auth.uid()
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

create function public.moderate_community_post(p_post_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_author uuid;
begin
  perform app_private.assert_admin_session();
  delete from public.community_posts where id = p_post_id returning user_id into v_author;
  if v_author is null then
    raise exception 'Messaggio non trovato' using errcode = 'P0002';
  end if;
  perform app_private.audit('post.moderated', 'user', v_author::text,
    jsonb_build_object('post_id', p_post_id));
end;
$$;
revoke execute on function public.moderate_community_post(bigint) from public, anon;
grant execute on function public.moderate_community_post(bigint) to authenticated;
