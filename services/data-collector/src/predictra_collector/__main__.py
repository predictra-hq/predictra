"""Riga di comando: ``python -m predictra_collector run [--competitions SA,PL] [--dry-run]``."""

from __future__ import annotations

import argparse
import sys

from .config import ConfigError, load_settings, parse_competitions
from .football_data import FootballDataClient
from .runner import run
from .supabase_store import SupabaseStore


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="predictra-collector")
    sub = parser.add_subparsers(dest="command", required=True)
    run_cmd = sub.add_parser("run", help="raccoglie partite e classifiche da football-data.org")
    run_cmd.add_argument("--competitions", help="codici separati da virgola (default: v1)")
    run_cmd.add_argument("--dry-run", action="store_true", help="non scrive su Supabase")
    run_cmd.add_argument(
        "--triggered-by", choices=["schedule", "manual"], default="manual", help="origine"
    )
    args = parser.parse_args(argv)

    try:
        settings = load_settings()
        competitions = parse_competitions(args.competitions)
        store = None
        if not args.dry_run:
            url, key = settings.require_supabase()
            store = SupabaseStore(url, key)
    except ConfigError as exc:
        print(f"Configurazione: {exc}", file=sys.stderr)
        return 2

    client = FootballDataClient(settings.football_data_api_key)
    secrets = (settings.football_data_api_key, settings.supabase_secret_key or "")
    summary = run(client, store, competitions, triggered_by=args.triggered_by, secrets=secrets)

    mode = "DRY RUN (nessuna scrittura)" if store is None else "scrittura su Supabase"
    print(f"football-data.org — {mode} — richieste: {client.requests_used}")
    for r in summary.results:
        line = (
            f"  {r.code:<4} {r.status:<9} partite={r.matches} squadre={r.teams} "
            f"classifica={r.standings} problemi={r.issues}"
        )
        if r.error:
            line += f" errore={r.error}"
        print(line)
    return 1 if summary.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
