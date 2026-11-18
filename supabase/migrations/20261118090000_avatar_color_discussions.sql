-- =============================================================================
-- PREDICTRA — M8: colore dell'avatar a scelta, ultimi commenti di tutte le partite
-- =============================================================================
-- Dizionario: docs/data-dictionary/identity.md
--
--  1. `profiles.avatar_color`: colore del cerchio dell'avatar (simbolo di PREDICTRA in
--     bianco), da un elenco chiuso. Vuoto = colore automatico ricavato dall'id.
--  2. `recent_comment_feed`: ultimi commenti di tutte le partite per la pagina
--     «Discussioni». Stesse regole di `match_comment_feed`: solo utenti attivi e
--     maggiorenni dichiarati, mai email né id dell'autore.
-- =============================================================================

alter table public.profiles
  add column avatar_color text
    constraint profiles_avatar_color_check
    check (avatar_color in ('teal', 'violet', 'orange', 'blue', 'pink', 'green'));

grant update (avatar_color) on public.profiles to authenticated;

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
  is_own boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_active_user() or not app_private.is_adult_user() then
    return;
  end if;
  return query
    select c.id, c.match_id, ht.name, at.name, m.kickoff_at, c.body, c.created_at,
           coalesce(p.display_name, 'Utente'), p.name_color, p.name_style,
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
