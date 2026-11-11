-- =============================================================================
-- M3 corsia 0 — ricollegamento degli eventi di quote non abbinati
-- =============================================================================
-- Un evento di The Odds API si abbina a una partita solo se i due nomi ricevuti
-- sono noti come alias (ADR 0015 §3). Finora l'abbinamento si ritentava solo alla
-- raccolta successiva dello stesso evento: un evento già giocato non torna più dal
-- provider, quindi restava scollegato per sempre e il suo avviso
-- 'odds.event_unmatched' restava aperto anche dopo l'aggiunta dell'alias.
-- Verificato su DEV l'11/11/2026: 20 avvisi aperti, tutti di partite del 7-8/11 con
-- entrambi i nomi già noti.
--
-- Ora:
--   - app_private.rematch_odds_events() riprova l'abbinamento di tutti gli eventi
--     senza partita (stessa regola della raccolta: competizione, squadre dagli alias,
--     calcio d'inizio entro 36 ore) e chiude come RESOLVED i loro avvisi;
--   - add_team_alias la chiama subito dopo aver aggiunto l'alias;
--   - questa migrazione la esegue una volta per gli eventi già raccolti.
-- Le quote degli eventi ricollegati tornano utili (storico delle quote di chiusura).
-- =============================================================================

create function app_private.rematch_odds_events()
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

revoke execute on function app_private.rematch_odds_events() from public, anon, authenticated;
grant execute on function app_private.rematch_odds_events() to service_role;

create or replace function public.add_team_alias(p_team_id bigint, p_alias text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform app_private.assert_admin_session();
  if not app_private.has_role('SUPER_ADMIN') then
    raise exception 'Solo un Super Admin può aggiungere alias' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'Squadra % inesistente', p_team_id using errcode = '23503';
  end if;
  if p_alias is null or char_length(btrim(p_alias)) not between 1 and 120 then
    raise exception 'Alias non valido' using errcode = '22023';
  end if;
  insert into public.team_aliases (team_id, alias, source)
  values (p_team_id, btrim(p_alias), 'manual')
  returning id into v_id;
  perform app_private.audit('team_alias.added', 'team', p_team_id::text,
                            jsonb_build_object('alias', btrim(p_alias)));
  -- Gli eventi già raccolti con questo nome si ricollegano subito, anche se passati.
  perform app_private.rematch_odds_events();
  return v_id;
end;
$$;

-- Una volta per gli eventi già raccolti (su DEV: i 20 eventi del 7-8/11/2026).
select app_private.rematch_odds_events();
