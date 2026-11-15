-- =============================================================================
-- M2 corsia 0 — statistiche e formazioni delle partite (ADR 0012)
-- =============================================================================
-- Fonte: API-Football (storico 2022-2024, piano Free). Formato dei dati letto dalla
-- documentazione v3 (`fixtures/statistics`, `fixtures/lineups`; con `ids` arrivano
-- nella stessa risposta di `/fixtures`).
--
-- Statistiche in formato lungo (una riga per voce): si salva esattamente ciò che il
-- provider manda, senza colonne inventate. La voce è il nome del provider in
-- snake_case (es. "Shots on Goal" -> shots_on_goal, "Passes %" -> passes_pct); i
-- valori percentuali sono numeri (32 per "32%").
-- Ogni riga conserva provider, ID partita del provider, observed_at, event_time,
-- qualità ed esecuzione (regola 4). Lettura per utenti attivi; scrittura solo dalla
-- funzione ingest_match_details (service_role).
-- =============================================================================

create table public.match_team_statistics (
  match_id           bigint not null references public.matches (id) on delete cascade,
  team_id            bigint not null references public.teams (id) on delete restrict,
  provider           text not null references public.providers (code),
  provider_match_id  text not null check (char_length(provider_match_id) between 1 and 100),
  stat               text not null check (stat ~ '^[a-z0-9_]{2,40}$'),
  value              numeric(12, 4),
  observed_at        timestamptz not null,
  event_time         timestamptz not null,
  quality            public.quality_status not null default 'OK',
  ingestion_run_id   bigint references public.ingestion_runs (id) on delete set null,
  primary key (match_id, team_id, provider, stat)
);
create index match_team_statistics_team_idx on public.match_team_statistics (team_id, stat);

create table public.match_lineups (
  match_id           bigint not null references public.matches (id) on delete cascade,
  team_id            bigint not null references public.teams (id) on delete restrict,
  provider           text not null references public.providers (code),
  provider_match_id  text not null check (char_length(provider_match_id) between 1 and 100),
  formation          text check (formation is null or formation ~ '^[0-9]([-][0-9]){1,5}$'),
  coach_provider_id  text check (coach_provider_id is null or char_length(coach_provider_id) <= 100),
  coach_name         text check (coach_name is null or char_length(coach_name) <= 120),
  observed_at        timestamptz not null,
  event_time         timestamptz not null,
  quality            public.quality_status not null default 'OK',
  ingestion_run_id   bigint references public.ingestion_runs (id) on delete set null,
  primary key (match_id, team_id, provider)
);

create table public.match_lineup_players (
  match_id            bigint not null,
  team_id             bigint not null,
  provider            text not null,
  player_provider_id  text not null check (char_length(player_provider_id) between 1 and 100),
  player_name         text not null check (char_length(player_name) between 1 and 120),
  shirt_number        smallint check (shirt_number is null or shirt_number between 0 and 999),
  position            text check (position is null or position in ('G', 'D', 'M', 'F')),
  grid                text check (grid is null or grid ~ '^[0-9]{1,2}:[0-9]{1,2}$'),
  is_starter          boolean not null,
  primary key (match_id, team_id, provider, player_provider_id),
  foreign key (match_id, team_id, provider)
    references public.match_lineups (match_id, team_id, provider) on delete cascade
);

alter table public.match_team_statistics enable row level security;
alter table public.match_lineups         enable row level security;
alter table public.match_lineup_players  enable row level security;

revoke all on public.match_team_statistics, public.match_lineups, public.match_lineup_players
  from public, anon, authenticated;
grant select on public.match_team_statistics, public.match_lineups, public.match_lineup_players
  to authenticated;
grant all on public.match_team_statistics, public.match_lineups, public.match_lineup_players
  to service_role;

create policy match_team_statistics_read on public.match_team_statistics
  for select to authenticated using (app_private.is_active_user());
create policy match_lineups_read on public.match_lineups
  for select to authenticated using (app_private.is_active_user());
create policy match_lineup_players_read on public.match_lineup_players
  for select to authenticated using (app_private.is_active_user());

-- -----------------------------------------------------------------------------
-- Scrittura di un lotto di dettagli (idempotente)
-- -----------------------------------------------------------------------------
-- Formato di p_batch (prodotto dall'adapter):
-- {
--   "observed_at": "...",
--   "matches": [{
--     "match_provider_id": "...", "event_time": "...",
--     "teams": [{
--       "team_provider_id": "...",
--       "statistics": [{"stat": "shots_on_goal", "value": 5}, ...],
--       "lineup": {"formation": "4-3-3", "coach_provider_id": "...", "coach_name": "...",
--                  "players": [{"player_provider_id": "...", "name": "...", "number": 9,
--                               "position": "F", "grid": "4:2", "starter": true}]}
--     }]
--   }]
-- }
-- Partite e squadre si ritrovano con provider_entity_map del provider dell'esecuzione:
-- una partita o squadra non mappata si salta e si conta in "skipped".
create function public.ingest_match_details(p_run_id bigint, p_batch jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_provider  text;
  v_observed  timestamptz := coalesce((p_batch ->> 'observed_at')::timestamptz, now());
  v_match     jsonb;
  v_team      jsonb;
  v_stat      jsonb;
  v_player    jsonb;
  v_match_id  bigint;
  v_team_id   bigint;
  v_event     timestamptz;
  v_lineup    jsonb;
  v_stats     integer := 0;
  v_lineups   integer := 0;
  v_players   integer := 0;
  v_skipped   integer := 0;
begin
  select provider into v_provider
  from public.ingestion_runs where id = p_run_id and status = 'RUNNING';
  if v_provider is null then
    raise exception 'Esecuzione % inesistente o non in corso', p_run_id using errcode = 'P0002';
  end if;

  for v_match in select * from jsonb_array_elements(coalesce(p_batch -> 'matches', '[]'::jsonb)) loop
    v_match_id := app_private.football_entity_id(v_provider, 'match', v_match ->> 'match_provider_id');
    if v_match_id is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_event := coalesce((v_match ->> 'event_time')::timestamptz, v_observed);

    for v_team in select * from jsonb_array_elements(coalesce(v_match -> 'teams', '[]'::jsonb)) loop
      v_team_id := app_private.football_entity_id(v_provider, 'team', v_team ->> 'team_provider_id');
      if v_team_id is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      for v_stat in select * from jsonb_array_elements(coalesce(v_team -> 'statistics', '[]'::jsonb)) loop
        insert into public.match_team_statistics
          (match_id, team_id, provider, provider_match_id, stat, value, observed_at, event_time,
           ingestion_run_id)
        values (v_match_id, v_team_id, v_provider, v_match ->> 'match_provider_id',
                v_stat ->> 'stat', (v_stat ->> 'value')::numeric, v_observed, v_event, p_run_id)
        on conflict (match_id, team_id, provider, stat) do update
          set value = excluded.value, observed_at = excluded.observed_at,
              event_time = excluded.event_time, ingestion_run_id = excluded.ingestion_run_id;
        v_stats := v_stats + 1;
      end loop;

      v_lineup := v_team -> 'lineup';
      if v_lineup is not null and jsonb_typeof(v_lineup) = 'object' then
        insert into public.match_lineups
          (match_id, team_id, provider, provider_match_id, formation, coach_provider_id,
           coach_name, observed_at, event_time, ingestion_run_id)
        values (v_match_id, v_team_id, v_provider, v_match ->> 'match_provider_id',
                v_lineup ->> 'formation', v_lineup ->> 'coach_provider_id',
                v_lineup ->> 'coach_name', v_observed, v_event, p_run_id)
        on conflict (match_id, team_id, provider) do update
          set formation = excluded.formation, coach_provider_id = excluded.coach_provider_id,
              coach_name = excluded.coach_name, observed_at = excluded.observed_at,
              event_time = excluded.event_time, ingestion_run_id = excluded.ingestion_run_id;
        -- La rosa si riscrive per intero: rieseguire non duplica e non lascia residui.
        delete from public.match_lineup_players
        where match_id = v_match_id and team_id = v_team_id and provider = v_provider;
        for v_player in select * from jsonb_array_elements(coalesce(v_lineup -> 'players', '[]'::jsonb)) loop
          insert into public.match_lineup_players
            (match_id, team_id, provider, player_provider_id, player_name, shirt_number,
             position, grid, is_starter)
          values (v_match_id, v_team_id, v_provider, v_player ->> 'player_provider_id',
                  v_player ->> 'name', (v_player ->> 'number')::smallint,
                  v_player ->> 'position', v_player ->> 'grid',
                  coalesce((v_player ->> 'starter')::boolean, false))
          on conflict (match_id, team_id, provider, player_provider_id) do nothing;
          v_players := v_players + 1;
        end loop;
        v_lineups := v_lineups + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('statistics', v_stats, 'lineups', v_lineups,
                            'players', v_players, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.ingest_match_details(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_match_details(bigint, jsonb) to service_role;
