#!/usr/bin/env bash
# Tabelle di cui il manifest registra il numero di righe (verifica del ripristino).
# shellcheck disable=SC2034
BACKUP_TABLES=(
  profiles user_roles invitations audit_logs
  competitions seasons teams matches standings ingestion_runs
  odds_events odds_snapshots
  model_versions predictions backtests
  bankrolls bankroll_movements bets
)
