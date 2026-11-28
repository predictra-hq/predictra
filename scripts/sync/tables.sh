#!/usr/bin/env bash
# Tabelle del database e che cosa ne fa la copia tra ambienti (ADR 0055).
# Ogni tabella di `public` deve stare in uno di questi elenchi: lo controlla
# supabase/tests/sync-tables.test.ts, così una tabella nuova non viene dimenticata.
# shellcheck disable=SC2034

# Dati calcistici e calcolati: arrivano dalle fonti e dal motore, uguali per tutti.
# Si copiano da PROD a DEV ogni giorno (e da DEV a PROD una volta, all'avvio).
SYNC_TABLES=(
  competitions seasons teams team_aliases matches standings provider_entity_map
  ingestion_runs data_quality_issues
  match_team_statistics match_lineups match_lineup_players
  bookmakers odds_events odds_snapshots
  model_versions prediction_runs predictions prediction_score_matrices backtests
  bet_builder_runs bet_proposals bet_proposal_legs recommended_slips
)

# Stato dell'agente: solo all'avvio di PROD (da DEV a PROD), così PROD riprende da dove
# era arrivato DEV e non ripete chiamate alle fonti già fatte in giornata.
SEED_ONLY_TABLES=(
  agent_jobs agent_runs agent_rate_limits
)

# Restano nel loro ambiente e non si copiano mai: account, dati personali, utilizzo,
# notifiche e tabelle di riferimento scritte dalle migrazioni.
LOCAL_TABLES=(
  profiles roles user_roles invitations audit_logs user_preferences user_dashboard_settings
  bankrolls bankroll_movements bets personal_limits user_bet_slips user_bet_slip_selections
  ask_usage notifications user_follows user_birthdays match_comments community_posts community_reactions feedback
  providers markets source_freshness_rules
)
