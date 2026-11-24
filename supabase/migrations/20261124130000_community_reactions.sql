-- Spogliatoio (ADR 0070): nella chat Schedine solo schedine condivise, e reazioni con
-- emoji sui messaggi, visibili a tutti.

-- Da ora un messaggio della chat Schedine deve contenere una schedina. NOT VALID: i
-- messaggi già scritti restano, il vincolo vale per i nuovi.
alter table public.community_posts
  add constraint community_posts_slips_only check (channel <> 'SLIPS' or slip is not null) not valid;

-- Reazioni: un'emoji da un elenco chiuso, una sola volta per persona e messaggio.
create table public.community_reactions (
  post_id     bigint not null references public.community_posts (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji       text not null check (emoji in ('👍', '❤️', '🔥', '😂', '😮', '😢', '👏', '⚽')),
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
create index community_reactions_post_idx on public.community_reactions (post_id);

alter table public.community_reactions enable row level security;
revoke all on public.community_reactions from public, anon, authenticated;
grant select, insert, delete on public.community_reactions to authenticated;
grant all on public.community_reactions to service_role;

-- Dalla tabella ognuno vede e toglie solo le proprie; i conteggi di tutti arrivano dal feed.
create policy community_reactions_owner on public.community_reactions for all to authenticated
  using (user_id = auth.uid() and (select app_private.is_active_user()))
  with check (user_id = auth.uid() and (select app_private.is_active_user()));

-- Il feed restituisce anche le reazioni: emoji, quante, se c'è anche la propria.
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
             select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.n, 'mine', r.mine)
                              order by r.n desc, r.emoji)
             from (
               select x.emoji, count(*)::int n, bool_or(x.user_id = auth.uid()) mine
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
revoke execute on function public.community_feed(text, integer) from public, anon;
grant execute on function public.community_feed(text, integer) to authenticated;
