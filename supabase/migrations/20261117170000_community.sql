-- =============================================================================
-- PREDICTRA — M8: compleanno, stile del nome e commenti alle partite
-- =============================================================================
-- Dizionario: docs/data-dictionary/identity.md (sezione "Comunità")
-- Decisione: docs/decisions/0058-comunita-commenti-e-maggiore-eta.md
--
-- Tre cose collegate:
--  1. data di nascita: dato personale, la vede solo il proprietario (nemmeno gli
--     amministratori). Gli altri sanno al più che oggi è il suo compleanno, se l'utente
--     lo permette (`show_birthday`);
--  2. stile del nome (colore e scritta) scelto da un elenco chiuso;
--  3. commenti sotto le partite, solo per chi ha dichiarato almeno 18 anni. L'età è
--     dichiarata, non verificata: lo dice anche l'interfaccia.
--
-- Principi:
--  * nessun dato esterno, nessuna email mostrata ad altri utenti;
--  * le letture di dati altrui passano solo da funzioni che restituiscono il minimo
--    (nome visualizzato e stile), mai dalle tabelle;
--  * limiti nel database: 500 caratteri per commento, al più 10 commenti in 5 minuti.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Stile del nome: due colonne nel profilo, valori da un elenco chiuso
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column name_color text
    constraint profiles_name_color_check
    check (name_color in ('green', 'teal', 'blue', 'violet', 'pink', 'orange', 'amber', 'red')),
  add column name_style text
    constraint profiles_name_style_check
    check (name_style in ('bold', 'italic', 'mono', 'caps'));

grant update (name_color, name_style) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Data di nascita: tabella separata, solo proprietario
-- -----------------------------------------------------------------------------
create table public.user_birthdays (
  user_id        uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  birth_date     date not null,
  show_birthday  boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- Una data plausibile: non nel futuro e non prima del 1900.
create function app_private.check_user_birthday()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.birth_date > current_date or new.birth_date < date '1900-01-01' then
    raise exception 'BIRTH_DATE_INVALID' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function app_private.check_user_birthday() from public, anon, authenticated;

create trigger user_birthdays_check before insert or update on public.user_birthdays
  for each row execute function app_private.check_user_birthday();

alter table public.user_birthdays enable row level security;
revoke all on public.user_birthdays from public, anon, authenticated;
grant select, insert, update, delete on public.user_birthdays to authenticated;
grant all on public.user_birthdays to service_role;

create policy user_birthdays_owner on public.user_birthdays for all to authenticated
  using (user_id = auth.uid() and (select app_private.is_active_user()))
  with check (user_id = auth.uid() and (select app_private.is_active_user()));

-- Maggiore età dichiarata dell'utente corrente: usata dalle policy dei commenti.
create function app_private.is_adult_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_birthdays b
    where b.user_id = auth.uid()
      and b.birth_date <= (current_date - interval '18 years')::date
  );
$$;
revoke execute on function app_private.is_adult_user() from public, anon;
grant execute on function app_private.is_adult_user() to authenticated;

-- Compleanni di oggi (fuso Europe/Rome), solo di chi li rende visibili. Nessuna data
-- né età: solo nome visualizzato e stile. Chi è nato il 29 febbraio compare il 28 negli
-- anni non bisestili.
create function public.birthdays_today()
returns table (display_name text, name_color text, name_style text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_leap boolean;
begin
  if not app_private.is_active_user() then
    return;
  end if;
  v_leap := extract(day from (date_trunc('year', v_today) + interval '2 months - 1 day')) = 29;
  return query
    select coalesce(p.display_name, 'Utente'), p.name_color, p.name_style
    from public.user_birthdays b
    join public.profiles p on p.id = b.user_id
    where b.show_birthday
      and p.status = 'ACTIVE'
      and (
        (extract(month from b.birth_date) = extract(month from v_today)
          and extract(day from b.birth_date) = extract(day from v_today))
        or (not v_leap and extract(month from v_today) = 2 and extract(day from v_today) = 28
          and extract(month from b.birth_date) = 2 and extract(day from b.birth_date) = 29)
      )
    order by 1
    limit 50;
end;
$$;
revoke execute on function public.birthdays_today() from public, anon;
grant execute on function public.birthdays_today() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Commenti alle partite
-- -----------------------------------------------------------------------------
create table public.match_comments (
  id          bigint generated always as identity primary key,
  match_id    bigint not null references public.matches (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index match_comments_match_idx on public.match_comments (match_id, created_at desc);
create index match_comments_user_idx on public.match_comments (user_id, created_at desc);

-- Al più 10 commenti in 5 minuti per utente: niente raffiche.
create function app_private.check_match_comments_rate()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.match_comments c
      where c.user_id = new.user_id and c.created_at > now() - interval '5 minutes') >= 10 then
    raise exception 'COMMENT_RATE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.check_match_comments_rate() from public, anon, authenticated;

create trigger match_comments_rate before insert on public.match_comments
  for each row execute function app_private.check_match_comments_rate();

alter table public.match_comments enable row level security;
revoke all on public.match_comments from public, anon, authenticated;
-- Si scrive e si cancella il proprio commento; nessuna modifica dopo la pubblicazione.
grant select, insert, delete on public.match_comments to authenticated;
grant all on public.match_comments to service_role;

-- Dalla tabella ognuno vede e tocca solo le proprie righe; i commenti degli altri si
-- leggono da `match_comment_feed`, che non espone l'id dell'autore.
create policy match_comments_owner on public.match_comments for all to authenticated
  using (user_id = auth.uid() and (select app_private.is_active_user()))
  with check (
    user_id = auth.uid()
    and (select app_private.is_active_user())
    and (select app_private.is_adult_user())
  );

-- Commenti di una partita, dal più recente: solo per utenti attivi e maggiorenni.
create function public.match_comment_feed(p_match_id bigint)
returns table (
  id bigint,
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
    select c.id, c.body, c.created_at, coalesce(p.display_name, 'Utente'),
           p.name_color, p.name_style, c.user_id = auth.uid()
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

-- Moderazione: un amministratore (sessione con 2FA) cancella un commento altrui. Resta
-- traccia nel registro, senza il testo del commento.
create function public.moderate_match_comment(p_comment_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_author uuid;
begin
  perform app_private.assert_admin_session();
  delete from public.match_comments where id = p_comment_id returning user_id into v_author;
  if v_author is null then
    raise exception 'Commento non trovato' using errcode = 'P0002';
  end if;
  perform app_private.audit('comment.moderated', 'user', v_author::text,
    jsonb_build_object('comment_id', p_comment_id));
end;
$$;
revoke execute on function public.moderate_match_comment(bigint) from public, anon;
grant execute on function public.moderate_match_comment(bigint) to authenticated;
