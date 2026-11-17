-- =============================================================================
-- Prestazioni: il controllo "utente attivo" una volta per lettura, non per riga
-- =============================================================================
-- Le policy di sola lettura usavano `using (app_private.is_active_user())`. Scritta così
-- la funzione viene valutata per ogni riga letta: leggendo le quote di poche partite
-- sono migliaia di chiamate, e le pagine andavano in "statement timeout" (Schedine,
-- Certezze, dettaglio schedina; visto nella Verifica DEV del 16/11/2026).
-- Con `(select …)` il risultato è calcolato una volta per istruzione (InitPlan) e
-- riusato. Il controllo è identico: un utente sospeso o senza ruolo continua a non
-- leggere nulla (test in supabase/tests). Nessun cambio ai dati né ai permessi.
-- =============================================================================

alter policy roles_select on public.roles
  using ((select app_private.is_active_user()));
alter policy providers_read on public.providers
  using ((select app_private.is_active_user()));
alter policy source_freshness_rules_read on public.source_freshness_rules
  using ((select app_private.is_active_user()));
alter policy ingestion_runs_read on public.ingestion_runs
  using ((select app_private.is_active_user()));
alter policy competitions_read on public.competitions
  using ((select app_private.is_active_user()));
alter policy seasons_read on public.seasons
  using ((select app_private.is_active_user()));
alter policy teams_read on public.teams
  using ((select app_private.is_active_user()));
alter policy team_aliases_read on public.team_aliases
  using ((select app_private.is_active_user()));
alter policy matches_read on public.matches
  using ((select app_private.is_active_user()));
alter policy standings_read on public.standings
  using ((select app_private.is_active_user()));
alter policy provider_entity_map_read on public.provider_entity_map
  using ((select app_private.is_active_user()));
alter policy data_quality_issues_read on public.data_quality_issues
  using ((select app_private.is_active_user()));
alter policy bookmakers_read on public.bookmakers
  using ((select app_private.is_active_user()));
alter policy markets_read on public.markets
  using ((select app_private.is_active_user()));
alter policy odds_events_read on public.odds_events
  using ((select app_private.is_active_user()));
alter policy odds_snapshots_read on public.odds_snapshots
  using ((select app_private.is_active_user()));
alter policy model_versions_read on public.model_versions
  using ((select app_private.is_active_user()));
alter policy prediction_runs_read on public.prediction_runs
  using ((select app_private.is_active_user()));
alter policy predictions_read on public.predictions
  using ((select app_private.is_active_user()));
alter policy prediction_score_matrices_read on public.prediction_score_matrices
  using ((select app_private.is_active_user()));
alter policy backtests_read on public.backtests
  using ((select app_private.is_active_user()));
alter policy bet_builder_runs_read on public.bet_builder_runs
  using ((select app_private.is_active_user()));
alter policy bet_proposals_read on public.bet_proposals
  using ((select app_private.is_active_user()));
alter policy bet_proposal_legs_read on public.bet_proposal_legs
  using ((select app_private.is_active_user()));
alter policy match_team_statistics_read on public.match_team_statistics
  using ((select app_private.is_active_user()));
alter policy match_lineups_read on public.match_lineups
  using ((select app_private.is_active_user()));
alter policy match_lineup_players_read on public.match_lineup_players
  using ((select app_private.is_active_user()));
