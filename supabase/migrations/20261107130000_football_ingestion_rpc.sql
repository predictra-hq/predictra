-- =============================================================================
-- PREDICTRA — M2 corsia 0: funzioni di scrittura per l'ingestion
-- =============================================================================
-- Il collector (services/data-collector) scrive solo tramite queste funzioni,
-- chiamate via PostgREST con la chiave secret (service_role). Ogni chiamata è
-- una transazione: un lotto viene scritto per intero o per niente.
--
-- Idempotenza: le entità si ritrovano tramite provider_entity_map, quindi
-- rieseguire lo stesso lotto aggiorna le stesse righe senza duplicarle.
-- Le classifiche diventano una nuova fotografia solo se cambiano; altrimenti
-- si aggiorna l'istante dell'ultima conferma (observed_at).
-- =============================================================================

-- ID canonico a partire dall'ID del provider (null se non mappato).
create function app_private.football_entity_id(
  p_provider text, p_type public.football_entity_type, p_provider_id text
) returns bigint
language sql stable set search_path = ''
as $$
  select entity_id from public.provider_entity_map
  where provider = p_provider and entity_type = p_type and provider_entity_id = p_provider_id;
$$;

create function app_private.map_football_entity(
  p_provider text, p_type public.football_entity_type, p_provider_id text,
  p_entity_id bigint, p_observed_at timestamptz
) returns void
language sql set search_path = ''
as $$
  insert into public.provider_entity_map (provider, entity_type, provider_entity_id, entity_id, observed_at)
  values (p_provider, p_type, p_provider_id, p_entity_id, p_observed_at)
  on conflict (provider, entity_type, provider_entity_id)
  do update set observed_at = excluded.observed_at;
$$;

-- Righe di classifica del lotto, con l'ID canonico della squadra (null se non mappata).
create function app_private.incoming_standings(p_provider text, p_batch jsonb, p_observed timestamptz)
returns table (
  team_id bigint, standing_type public.standing_type, stage text, group_name text,
  pos smallint, played smallint, won smallint, draw smallint, lost smallint,
  goals_for smallint, goals_against smallint, points smallint, event_time timestamptz
)
language sql stable set search_path = ''
as $$
  select
    app_private.football_entity_id(p_provider, 'team', e ->> 'team_provider_id'),
    coalesce((e ->> 'standing_type')::public.standing_type, 'TOTAL'),
    coalesce(e ->> 'stage', 'REGULAR_SEASON'),
    coalesce(e ->> 'group_name', ''),
    (e ->> 'position')::smallint, (e ->> 'played')::smallint,
    (e ->> 'won')::smallint, (e ->> 'draw')::smallint, (e ->> 'lost')::smallint,
    (e ->> 'goals_for')::smallint, (e ->> 'goals_against')::smallint, (e ->> 'points')::smallint,
    coalesce((e ->> 'event_time')::timestamptz, p_observed)
  from jsonb_array_elements(coalesce(p_batch -> 'standings', '[]'::jsonb)) as e;
$$;

-- -----------------------------------------------------------------------------
-- Ciclo di vita di un'esecuzione
-- -----------------------------------------------------------------------------
create function public.start_ingestion_run(
  p_provider text, p_job_type text, p_window_key text, p_triggered_by text default 'schedule'
) returns bigint
language plpgsql set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not exists (
    select 1 from public.providers where code = p_provider and terms_verified_at is not null
  ) then
    raise exception 'Provider % sconosciuto o con termini d''uso non verificati', p_provider
      using errcode = 'P0001';
  end if;

  -- Esecuzioni rimaste aperte (worker interrotto): chiuse come fallite.
  update public.ingestion_runs
  set status = 'FAILED', finished_at = now(),
      error_summary = 'Esecuzione interrotta: chiusa automaticamente dopo 1 ora'
  where provider = p_provider and status = 'RUNNING' and started_at < now() - interval '1 hour';

  begin
    insert into public.ingestion_runs (provider, job_type, window_key, triggered_by)
    values (p_provider, p_job_type, p_window_key, p_triggered_by)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esecuzione già in corso per %/%/%', p_provider, p_job_type, p_window_key
      using errcode = 'P0002';
  end;
  return v_id;
end;
$$;

create function public.finish_ingestion_run(
  p_run_id bigint,
  p_status public.ingestion_run_status,
  p_requests_used integer default 0,
  p_quota_remaining integer default null,
  p_rows_upserted integer default 0,
  p_error_count integer default 0,
  p_error_summary text default null,
  p_resume_cursor jsonb default null
) returns void
language plpgsql set search_path = ''
as $$
begin
  if p_status = 'RUNNING' then
    raise exception 'Lo stato finale non può essere RUNNING' using errcode = '22023';
  end if;
  update public.ingestion_runs
  set status = p_status,
      finished_at = now(),
      requests_used = coalesce(p_requests_used, 0),
      quota_remaining = p_quota_remaining,
      rows_upserted = coalesce(p_rows_upserted, 0),
      error_count = coalesce(p_error_count, 0),
      error_summary = left(p_error_summary, 2000),
      resume_cursor = p_resume_cursor
  where id = p_run_id and status = 'RUNNING';
  if not found then
    raise exception 'Esecuzione % inesistente o già chiusa', p_run_id using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Scrittura di un lotto: una competizione e una stagione
-- -----------------------------------------------------------------------------
-- Formato di p_batch (prodotto dagli adapter, indipendente dal provider):
-- {
--   "observed_at": "...",
--   "competition": {provider_id, name, code, type, area_name, area_code, event_time},
--   "season": {provider_id, label, start_date, end_date, current_matchday, event_time},
--   "teams": [{provider_id, name, short_name, tla, area_code, event_time}],
--   "matches": [{provider_id, matchday, stage, group_name, kickoff_at, status,
--                home_team_provider_id, away_team_provider_id, home_score, away_score,
--                home_score_ht, away_score_ht, score_duration, event_time, quality}],
--   "standings": [{team_provider_id, standing_type, stage, group_name, position, played,
--                  won, draw, lost, goals_for, goals_against, points, event_time}]
-- }
create function public.ingest_football_batch(p_run_id bigint, p_batch jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_provider       text;
  v_observed       timestamptz := coalesce((p_batch ->> 'observed_at')::timestamptz, now());
  v_comp           jsonb := p_batch -> 'competition';
  v_season         jsonb := p_batch -> 'season';
  v_comp_id        bigint;
  v_season_id      bigint;
  v_team_id        bigint;
  v_match_id       bigint;
  v_home_id        bigint;
  v_away_id        bigint;
  v_item           jsonb;
  v_teams          integer := 0;
  v_matches        integer := 0;
  v_st_inserted    integer := 0;
  v_st_confirmed   integer := 0;
  v_latest         timestamptz;
  v_changed        boolean;
begin
  select provider into v_provider
  from public.ingestion_runs where id = p_run_id and status = 'RUNNING';
  if v_provider is null then
    raise exception 'Esecuzione % inesistente o non in corso', p_run_id using errcode = 'P0002';
  end if;
  if v_comp is null or v_season is null then
    raise exception 'Lotto senza competizione o stagione' using errcode = '22023';
  end if;

  -- Competizione: per mapping, poi per codice, altrimenti nuova.
  v_comp_id := app_private.football_entity_id(v_provider, 'competition', v_comp ->> 'provider_id');
  if v_comp_id is null and v_comp ->> 'code' is not null then
    select id into v_comp_id from public.competitions where code = v_comp ->> 'code';
  end if;
  if v_comp_id is null then
    insert into public.competitions
      (name, code, type, area_name, area_code, provider, observed_at, event_time, ingestion_run_id)
    values (v_comp ->> 'name', v_comp ->> 'code', (v_comp ->> 'type')::public.competition_type,
            v_comp ->> 'area_name', v_comp ->> 'area_code', v_provider, v_observed,
            (v_comp ->> 'event_time')::timestamptz, p_run_id)
    returning id into v_comp_id;
  else
    update public.competitions
    set name = v_comp ->> 'name', code = v_comp ->> 'code',
        type = (v_comp ->> 'type')::public.competition_type,
        area_name = v_comp ->> 'area_name', area_code = v_comp ->> 'area_code',
        provider = v_provider, observed_at = v_observed,
        event_time = (v_comp ->> 'event_time')::timestamptz, ingestion_run_id = p_run_id
    where id = v_comp_id;
  end if;
  perform app_private.map_football_entity(v_provider, 'competition', v_comp ->> 'provider_id', v_comp_id, v_observed);

  -- Stagione: per mapping, poi per (competizione, data di inizio).
  v_season_id := app_private.football_entity_id(v_provider, 'season', v_season ->> 'provider_id');
  if v_season_id is null then
    select id into v_season_id from public.seasons
    where competition_id = v_comp_id and start_date = (v_season ->> 'start_date')::date;
  end if;
  if v_season_id is null then
    insert into public.seasons
      (competition_id, label, start_date, end_date, current_matchday, provider, observed_at,
       event_time, ingestion_run_id)
    values (v_comp_id, v_season ->> 'label', (v_season ->> 'start_date')::date,
            (v_season ->> 'end_date')::date, (v_season ->> 'current_matchday')::integer,
            v_provider, v_observed, (v_season ->> 'event_time')::timestamptz, p_run_id)
    returning id into v_season_id;
  else
    update public.seasons
    set label = v_season ->> 'label', start_date = (v_season ->> 'start_date')::date,
        end_date = (v_season ->> 'end_date')::date,
        current_matchday = (v_season ->> 'current_matchday')::integer,
        provider = v_provider, observed_at = v_observed,
        event_time = (v_season ->> 'event_time')::timestamptz, ingestion_run_id = p_run_id
    where id = v_season_id;
  end if;
  perform app_private.map_football_entity(v_provider, 'season', v_season ->> 'provider_id', v_season_id, v_observed);

  -- Squadre e alias.
  for v_item in select * from jsonb_array_elements(coalesce(p_batch -> 'teams', '[]'::jsonb)) loop
    v_team_id := app_private.football_entity_id(v_provider, 'team', v_item ->> 'provider_id');
    if v_team_id is null then
      insert into public.teams (name, short_name, tla, area_code, provider, observed_at, event_time, ingestion_run_id)
      values (v_item ->> 'name', v_item ->> 'short_name', v_item ->> 'tla', v_item ->> 'area_code',
              v_provider, v_observed, (v_item ->> 'event_time')::timestamptz, p_run_id)
      returning id into v_team_id;
    else
      update public.teams
      set name = v_item ->> 'name', short_name = v_item ->> 'short_name', tla = v_item ->> 'tla',
          area_code = coalesce(v_item ->> 'area_code', area_code), provider = v_provider,
          observed_at = v_observed, event_time = (v_item ->> 'event_time')::timestamptz,
          ingestion_run_id = p_run_id
      where id = v_team_id;
    end if;
    perform app_private.map_football_entity(v_provider, 'team', v_item ->> 'provider_id', v_team_id, v_observed);
    insert into public.team_aliases (team_id, alias, source)
    select v_team_id, a, v_provider
    from unnest(array[v_item ->> 'name', v_item ->> 'short_name']) as a
    where a is not null and btrim(a) <> ''
    on conflict (source, normalized_alias) do nothing;
    v_teams := v_teams + 1;
  end loop;

  -- Partite.
  for v_item in select * from jsonb_array_elements(coalesce(p_batch -> 'matches', '[]'::jsonb)) loop
    v_home_id := app_private.football_entity_id(v_provider, 'team', v_item ->> 'home_team_provider_id');
    v_away_id := app_private.football_entity_id(v_provider, 'team', v_item ->> 'away_team_provider_id');
    if v_home_id is null or v_away_id is null then
      raise exception 'Partita %: squadra non presente nel lotto', v_item ->> 'provider_id'
        using errcode = '23503';
    end if;
    v_match_id := app_private.football_entity_id(v_provider, 'match', v_item ->> 'provider_id');
    if v_match_id is null then
      insert into public.matches
        (competition_id, season_id, matchday, stage, group_name, kickoff_at, status,
         home_team_id, away_team_id, home_score, away_score, home_score_ht, away_score_ht,
         score_duration, provider, observed_at, event_time, quality, ingestion_run_id)
      values (v_comp_id, v_season_id, (v_item ->> 'matchday')::integer, v_item ->> 'stage',
              v_item ->> 'group_name', (v_item ->> 'kickoff_at')::timestamptz,
              (v_item ->> 'status')::public.match_status, v_home_id, v_away_id,
              (v_item ->> 'home_score')::smallint, (v_item ->> 'away_score')::smallint,
              (v_item ->> 'home_score_ht')::smallint, (v_item ->> 'away_score_ht')::smallint,
              (v_item ->> 'score_duration')::public.score_duration, v_provider, v_observed,
              (v_item ->> 'event_time')::timestamptz,
              coalesce((v_item ->> 'quality')::public.quality_status, 'OK'), p_run_id)
      returning id into v_match_id;
      perform app_private.map_football_entity(v_provider, 'match', v_item ->> 'provider_id', v_match_id, v_observed);
    else
      update public.matches
      set competition_id = v_comp_id, season_id = v_season_id,
          matchday = (v_item ->> 'matchday')::integer, stage = v_item ->> 'stage',
          group_name = v_item ->> 'group_name', kickoff_at = (v_item ->> 'kickoff_at')::timestamptz,
          status = (v_item ->> 'status')::public.match_status,
          home_team_id = v_home_id, away_team_id = v_away_id,
          home_score = (v_item ->> 'home_score')::smallint, away_score = (v_item ->> 'away_score')::smallint,
          home_score_ht = (v_item ->> 'home_score_ht')::smallint,
          away_score_ht = (v_item ->> 'away_score_ht')::smallint,
          score_duration = (v_item ->> 'score_duration')::public.score_duration,
          provider = v_provider, observed_at = v_observed,
          event_time = (v_item ->> 'event_time')::timestamptz,
          quality = coalesce((v_item ->> 'quality')::public.quality_status, 'OK'),
          ingestion_run_id = p_run_id
      where id = v_match_id;
      perform app_private.map_football_entity(v_provider, 'match', v_item ->> 'provider_id', v_match_id, v_observed);
    end if;
    v_matches := v_matches + 1;
  end loop;

  -- Classifica: nuova fotografia solo se diversa dall'ultima.
  if jsonb_array_length(coalesce(p_batch -> 'standings', '[]'::jsonb)) > 0 then
    if exists (select 1 from app_private.incoming_standings(v_provider, p_batch, v_observed) where team_id is null) then
      raise exception 'Classifica: squadra non presente nel lotto' using errcode = '23503';
    end if;

    select max(observed_at) into v_latest from public.standings where season_id = v_season_id;

    v_changed := v_latest is null or exists (
      (select team_id, standing_type, stage, group_name, pos, played, won, draw, lost,
              goals_for, goals_against, points
       from app_private.incoming_standings(v_provider, p_batch, v_observed)
       except
       select team_id, standing_type, stage, group_name, position, played, won, draw, lost,
              goals_for, goals_against, points
       from public.standings where season_id = v_season_id and observed_at = v_latest)
      union all
      (select team_id, standing_type, stage, group_name, position, played, won, draw, lost,
              goals_for, goals_against, points
       from public.standings where season_id = v_season_id and observed_at = v_latest
       except
       select team_id, standing_type, stage, group_name, pos, played, won, draw, lost,
              goals_for, goals_against, points
       from app_private.incoming_standings(v_provider, p_batch, v_observed))
    );

    if v_changed then
      insert into public.standings
        (competition_id, season_id, team_id, standing_type, stage, group_name, position, played,
         won, draw, lost, goals_for, goals_against, points, provider, observed_at, event_time,
         ingestion_run_id)
      select v_comp_id, v_season_id, i.team_id, i.standing_type, i.stage, i.group_name, i.pos,
             i.played, i.won, i.draw, i.lost, i.goals_for, i.goals_against, i.points, v_provider,
             v_observed, i.event_time, p_run_id
      from app_private.incoming_standings(v_provider, p_batch, v_observed) i;
      get diagnostics v_st_inserted = row_count;
    elsif v_observed > v_latest then
      update public.standings
      set observed_at = v_observed, ingestion_run_id = p_run_id
      where season_id = v_season_id and observed_at = v_latest;
      get diagnostics v_st_confirmed = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'competition_id', v_comp_id,
    'season_id', v_season_id,
    'teams', v_teams,
    'matches', v_matches,
    'standings_inserted', v_st_inserted,
    'standings_confirmed', v_st_confirmed
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Problemi di qualità
-- -----------------------------------------------------------------------------
-- p_issues: [{check_code, severity, entity_type, provider_entity_id, details}]
-- Un problema già aperto per lo stesso controllo ed entità viene aggiornato.
create function public.report_quality_issues(p_run_id bigint, p_issues jsonb)
returns integer
language plpgsql set search_path = ''
as $$
declare
  v_provider  text;
  v_item      jsonb;
  v_type      public.football_entity_type;
  v_pid       text;
  v_entity_id bigint;
  v_count     integer := 0;
begin
  select provider into v_provider from public.ingestion_runs where id = p_run_id;
  if v_provider is null then
    raise exception 'Esecuzione % inesistente', p_run_id using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) loop
    v_type := (v_item ->> 'entity_type')::public.football_entity_type;
    v_pid := v_item ->> 'provider_entity_id';
    v_entity_id := case when v_type is not null and v_pid is not null
                        then app_private.football_entity_id(v_provider, v_type, v_pid) end;

    update public.data_quality_issues
    set severity = (v_item ->> 'severity')::public.issue_severity,
        details = coalesce(v_item -> 'details', '{}'::jsonb),
        last_seen_at = now(),
        ingestion_run_id = p_run_id
    where status = 'OPEN'
      and check_code = v_item ->> 'check_code'
      and provider is not distinct from v_provider
      and entity_type is not distinct from v_type
      and entity_id is not distinct from v_entity_id
      and provider_entity_id is not distinct from v_pid;

    if not found then
      insert into public.data_quality_issues
        (provider, entity_type, entity_id, provider_entity_id, check_code, severity, details,
         ingestion_run_id)
      values (v_provider, v_type, v_entity_id, v_pid, v_item ->> 'check_code',
              (v_item ->> 'severity')::public.issue_severity,
              coalesce(v_item -> 'details', '{}'::jsonb), p_run_id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilegi: solo service_role (la chiave secret del collector)
-- -----------------------------------------------------------------------------
revoke execute on function app_private.football_entity_id(text, public.football_entity_type, text)
  from public, anon, authenticated;
revoke execute on function app_private.map_football_entity(text, public.football_entity_type, text, bigint, timestamptz)
  from public, anon, authenticated;
revoke execute on function app_private.incoming_standings(text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function app_private.football_entity_id(text, public.football_entity_type, text) to service_role;
grant execute on function app_private.map_football_entity(text, public.football_entity_type, text, bigint, timestamptz)
  to service_role;
grant execute on function app_private.incoming_standings(text, jsonb, timestamptz) to service_role;
grant execute on function app_private.check_provider_entity() to service_role;
revoke execute on function public.start_ingestion_run(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.finish_ingestion_run(bigint, public.ingestion_run_status, integer, integer, integer, integer, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.ingest_football_batch(bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.report_quality_issues(bigint, jsonb) from public, anon, authenticated;

grant execute on function public.start_ingestion_run(text, text, text, text) to service_role;
grant execute on function public.finish_ingestion_run(bigint, public.ingestion_run_status, integer, integer, integer, integer, text, jsonb)
  to service_role;
grant execute on function public.ingest_football_batch(bigint, jsonb) to service_role;
grant execute on function public.report_quality_issues(bigint, jsonb) to service_role;
