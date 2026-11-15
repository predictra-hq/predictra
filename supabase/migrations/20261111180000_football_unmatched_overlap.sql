-- =============================================================================
-- M2 corsia 0 — segnalazione delle squadre non abbinate solo dove serve (ADR 0011)
-- =============================================================================
-- Il backfill di API-Football (11/11/2026) ha segnalato 53 squadre come
-- 'team.cross_provider_unmatched'. Erano squadre retrocesse prima della stagione in
-- corso: nello storico 2022-2024 non esistono su football-data.org, quindi non c'era
-- niente da abbinare. La regola diventa più precisa: si segnala una squadra nuova solo
-- se la stessa stagione ha già dati di un altro provider.
-- Le segnalazioni aperte con la regola precedente si chiudono come IGNORED.
-- =============================================================================

create or replace function public.ingest_football_batch(p_run_id bigint, p_batch jsonb)
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
  v_matched_teams  integer := 0;
  v_matched_matches integer := 0;
  v_unmatched      integer := 0;
  v_owned          boolean;
  v_other_provider boolean;
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
    -- Solo il provider che ha creato la competizione ne aggiorna i dati (ADR 0011).
    update public.competitions
    set name = v_comp ->> 'name', code = v_comp ->> 'code',
        type = (v_comp ->> 'type')::public.competition_type,
        area_name = v_comp ->> 'area_name', area_code = v_comp ->> 'area_code',
        provider = v_provider, observed_at = v_observed,
        event_time = (v_comp ->> 'event_time')::timestamptz, ingestion_run_id = p_run_id
    where id = v_comp_id and provider = v_provider;
  end if;
  perform app_private.map_football_entity(v_provider, 'competition', v_comp ->> 'provider_id', v_comp_id, v_observed);

  -- Stagione: per mapping, poi per (competizione, data di inizio).
  v_season_id := app_private.football_entity_id(v_provider, 'season', v_season ->> 'provider_id');
  if v_season_id is null then
    select id into v_season_id from public.seasons
    where competition_id = v_comp_id and start_date = (v_season ->> 'start_date')::date;
  end if;
  -- Altro provider: la stessa stagione può avere una data d'inizio di qualche giorno diversa.
  if v_season_id is null then
    select s.id into v_season_id from public.seasons s
    where s.competition_id = v_comp_id
      and abs(s.start_date - (v_season ->> 'start_date')::date) <= 31
      and not exists (
        select 1 from public.provider_entity_map m
        where m.provider = v_provider and m.entity_type = 'season' and m.entity_id = s.id
      )
    order by abs(s.start_date - (v_season ->> 'start_date')::date)
    limit 1;
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
    where id = v_season_id and provider = v_provider;
  end if;
  perform app_private.map_football_entity(v_provider, 'season', v_season ->> 'provider_id', v_season_id, v_observed);

  -- La stessa stagione ha già dati di un altro provider? Solo allora una squadra
  -- nuova è sospetta (forse è una già nota con un nome diverso). In una stagione
  -- coperta da un solo provider, per esempio lo storico, una squadra nuova è normale
  -- (retrocessa prima della stagione in corso) e non si segnala.
  select exists (
    select 1 from public.seasons where id = v_season_id and provider <> v_provider
  ) into v_other_provider;

  -- Squadre e alias.
  for v_item in select * from jsonb_array_elements(coalesce(p_batch -> 'teams', '[]'::jsonb)) loop
    v_team_id := app_private.football_entity_id(v_provider, 'team', v_item ->> 'provider_id');
    -- Non ancora mappata per questo provider: si cerca la stessa squadra già nota
    -- con un altro provider tramite gli alias (nome o nome breve), ADR 0011.
    if v_team_id is null then
      -- Suggerimento dell'adapter (stessa squadra trovata con un confronto più ampio
      -- dei nomi), valido solo se la squadra esiste; altrimenti gli alias esatti.
      if v_item ? 'same_as_team_id' and exists (
        select 1 from public.teams where id = (v_item ->> 'same_as_team_id')::bigint
      ) then
        v_team_id := (v_item ->> 'same_as_team_id')::bigint;
      else
        v_team_id := coalesce(
          app_private.team_by_alias(v_item ->> 'name'),
          app_private.team_by_alias(v_item ->> 'short_name')
        );
      end if;
      -- Una squadra canonica ha un solo ID per provider: se è già abbinata a un'altra
      -- squadra di questo provider, l'alias è sbagliato e non si usa.
      if v_team_id is not null and exists (
        select 1 from public.provider_entity_map
        where provider = v_provider and entity_type = 'team' and entity_id = v_team_id
      ) then
        v_team_id := null;
      end if;
      if v_team_id is not null then
        v_matched_teams := v_matched_teams + 1;
      end if;
    end if;
    if v_team_id is null then
      insert into public.teams (name, short_name, tla, area_code, provider, observed_at, event_time, ingestion_run_id)
      values (v_item ->> 'name', v_item ->> 'short_name', v_item ->> 'tla', v_item ->> 'area_code',
              v_provider, v_observed, (v_item ->> 'event_time')::timestamptz, p_run_id)
      returning id into v_team_id;
      if v_other_provider then
        -- Squadra nuova in una stagione che ha già dati di un altro provider:
        -- forse è la stessa con un nome diverso. Da abbinare con un alias (pagina admin).
        insert into public.data_quality_issues
          (provider, entity_type, entity_id, provider_entity_id, check_code, severity, details,
           ingestion_run_id)
        values (v_provider, 'team', v_team_id, v_item ->> 'provider_id', 'team.cross_provider_unmatched',
                'WARNING', jsonb_build_object('name', v_item ->> 'name',
                                              'short_name', v_item ->> 'short_name'), p_run_id)
        on conflict (check_code, provider, entity_type, entity_id, provider_entity_id)
          where status = 'OPEN'
          do update set last_seen_at = now(), ingestion_run_id = excluded.ingestion_run_id;
        v_unmatched := v_unmatched + 1;
      end if;
    else
      update public.teams
      set name = v_item ->> 'name', short_name = v_item ->> 'short_name', tla = v_item ->> 'tla',
          area_code = coalesce(v_item ->> 'area_code', area_code), provider = v_provider,
          observed_at = v_observed, event_time = (v_item ->> 'event_time')::timestamptz,
          ingestion_run_id = p_run_id
      where id = v_team_id and provider = v_provider;
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
    -- Stessa partita già registrata da un altro provider: stesse squadre e stagione,
    -- calcio d'inizio entro 2 giorni. Si mappa senza sovrascrivere (ADR 0011).
    if v_match_id is null then
      select id into v_match_id from public.matches
      where season_id = v_season_id and home_team_id = v_home_id and away_team_id = v_away_id
        and provider <> v_provider
        and abs(extract(epoch from kickoff_at - (v_item ->> 'kickoff_at')::timestamptz)) <= 172800
      order by abs(extract(epoch from kickoff_at - (v_item ->> 'kickoff_at')::timestamptz))
      limit 1;
      if v_match_id is not null and exists (
        select 1 from public.provider_entity_map
        where provider = v_provider and entity_type = 'match' and entity_id = v_match_id
      ) then
        v_match_id := null;
      end if;
      if v_match_id is not null then
        perform app_private.map_football_entity(v_provider, 'match', v_item ->> 'provider_id', v_match_id, v_observed);
        v_matched_matches := v_matched_matches + 1;
      end if;
    end if;
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
      where id = v_match_id and provider = v_provider;
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
    'standings_confirmed', v_st_confirmed,
    'teams_matched', v_matched_teams,
    'teams_unmatched', v_unmatched,
    'matches_matched', v_matched_matches
  );
end;
$$;

revoke execute on function public.ingest_football_batch(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_football_batch(bigint, jsonb) to service_role;

update public.data_quality_issues i
set status = 'IGNORED', resolved_at = now()
where i.check_code = 'team.cross_provider_unmatched'
  and i.status = 'OPEN'
  and not exists (
    -- resta aperta solo se la squadra gioca in una stagione con dati di altri provider
    select 1
    from public.matches m
    join public.seasons s on s.id = m.season_id
    where (m.home_team_id = i.entity_id or m.away_team_id = i.entity_id)
      and s.provider is distinct from i.provider
  );
