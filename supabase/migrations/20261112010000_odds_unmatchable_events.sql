-- =============================================================================
-- M3 corsia 0 — eventi di quote non abbinabili e ricollegamento automatico
-- =============================================================================
-- Caso su DEV (12/11/2026): l'evento PPL Estoril - CS Maritimo dell'8/11 restava
-- "non abbinato" con entrambi i nomi già noti come alias. La partita non è in quella
-- data: football-data.org la riporta il 4/1/2027 (giornata 11, rinviata). Nessun
-- alias poteva risolverlo e la pagina Alias squadre non offriva azioni.
--
-- Ora app_private.rematch_odds_events():
--   - abbina come prima (competizione, alias, calcio d'inizio entro 36 ore);
--   - per un evento passato da oltre 36 ore con i due nomi noti e nessuna partita,
--     chiude l'avviso come IGNORED con il motivo (rinvio o partita fuori calendario).
-- E gira da sola alla fine di ogni raccolta riuscita di quote o calendario
-- (finish_ingestion_run), non solo quando si aggiunge un alias.
-- =============================================================================

create or replace function app_private.rematch_odds_events()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_event record;
  v_home  bigint;
  v_away  bigint;
  v_match bigint;
  v_count integer := 0;
begin
  for v_event in
    select id, provider, provider_event_id, competition_id, commence_time,
           home_team_name, away_team_name
    from public.odds_events
    where match_id is null and competition_id is not null
  loop
    v_home := app_private.team_by_alias(v_event.home_team_name);
    v_away := app_private.team_by_alias(v_event.away_team_name);
    if v_home is null or v_away is null then
      continue;
    end if;
    select m.id into v_match
    from public.matches m
    where m.competition_id = v_event.competition_id
      and m.home_team_id = v_home and m.away_team_id = v_away
      and m.kickoff_at between v_event.commence_time - interval '36 hours'
                           and v_event.commence_time + interval '36 hours'
    order by abs(extract(epoch from (m.kickoff_at - v_event.commence_time)))
    limit 1;
    if v_match is null then
      -- Nomi noti ma nessuna partita entro 36 ore: per un evento passato vuol dire
      -- che la partita è stata spostata (rinvio) o non è nel calendario. Nessun alias
      -- può abbinarlo: l'avviso si chiude come IGNORED, con il motivo.
      if v_event.commence_time < now() - interval '36 hours' then
        update public.data_quality_issues
        set status = 'IGNORED', resolved_at = now(),
            details = details || jsonb_build_object(
              'closed_reason', 'nomi noti, nessuna partita del calendario entro 36 ore')
        where status = 'OPEN' and check_code = 'odds.event_unmatched'
          and provider = v_event.provider and provider_entity_id = v_event.provider_event_id;
      end if;
      continue;
    end if;
    update public.odds_events set match_id = v_match where id = v_event.id;
    update public.data_quality_issues
    set status = 'RESOLVED', resolved_at = now()
    where status = 'OPEN' and check_code = 'odds.event_unmatched'
      and provider = v_event.provider and provider_entity_id = v_event.provider_event_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.finish_ingestion_run(
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
  -- Nuove quote o calendario aggiornato (anche partite rinviate): si riprova
  -- l'abbinamento degli eventi di quote rimasti senza partita.
  if p_status in ('SUCCEEDED', 'PARTIAL') and exists (
    select 1 from public.ingestion_runs
    where id = p_run_id and provider in ('the-odds-api', 'football-data-org')
  ) then
    perform app_private.rematch_odds_events();
  end if;
end;
$$;

-- Una volta per gli eventi già raccolti.
select app_private.rematch_odds_events();
