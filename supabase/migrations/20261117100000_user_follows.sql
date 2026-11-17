-- =============================================================================
-- PREDICTRA — M8: squadre e campionati seguiti
-- =============================================================================
-- Dizionario: docs/data-dictionary/identity.md (sezione "Seguiti")
--
-- Ogni utente può seguire squadre e campionati: l'app li usa per mettere in evidenza
-- le loro partite. Finora c'era solo il "campionato preferito", salvato in un cookie
-- del browser e quindi diverso su ogni dispositivo.
--
-- Principi:
--  * dato personale: RLS solo proprietario, nemmeno gli amministratori lo leggono;
--  * una riga segue UNA cosa: una squadra oppure un campionato;
--  * al più 50 righe per utente (elenco da scorrere, non un archivio);
--  * nessun dato da fonti esterne.
-- =============================================================================

create table public.user_follows (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  team_id         bigint references public.teams (id) on delete cascade,
  competition_id  bigint references public.competitions (id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint user_follows_one_target check (num_nonnulls(team_id, competition_id) = 1)
);
create unique index user_follows_team_unique
  on public.user_follows (user_id, team_id) where team_id is not null;
create unique index user_follows_competition_unique
  on public.user_follows (user_id, competition_id) where competition_id is not null;

-- Limite per utente, nel database e non solo nell'interfaccia.
create function app_private.check_user_follows_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.user_follows f where f.user_id = new.user_id) >= 50 then
    raise exception 'FOLLOW_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function app_private.check_user_follows_limit() from public, anon, authenticated;

create trigger user_follows_limit before insert on public.user_follows
  for each row execute function app_private.check_user_follows_limit();

alter table public.user_follows enable row level security;
revoke all on public.user_follows from public, anon, authenticated;
-- Si segue e si smette di seguire: nessuna modifica di una riga esistente.
grant select, insert, delete on public.user_follows to authenticated;
grant all on public.user_follows to service_role;

create policy user_follows_owner on public.user_follows for all to authenticated
  using (user_id = auth.uid() and (select app_private.is_active_user()))
  with check (user_id = auth.uid() and (select app_private.is_active_user()));
