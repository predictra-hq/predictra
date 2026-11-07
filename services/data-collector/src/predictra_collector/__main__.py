"""Riga di comando.

- ``python -m predictra_collector run [--competitions SA,PL] [--dry-run]``: football-data.org
- ``python -m predictra_collector odds [--mode daily|prematch] [--competitions SA] [--dry-run]``:
  quote 1X2 da The Odds API
"""

from __future__ import annotations

import argparse
import sys

from .config import ConfigError, Settings, load_settings, parse_competitions
from .football_data import FootballDataClient
from .odds_runner import run_odds
from .runner import run
from .supabase_store import SupabaseStore
from .the_odds_api import OddsApiClient


def _store(settings: Settings, dry_run: bool) -> SupabaseStore | None:
    if dry_run:
        return None
    url, key = settings.require_supabase()
    return SupabaseStore(url, key)


def _cmd_run(args: argparse.Namespace, settings: Settings) -> int:
    client = FootballDataClient(settings.require_football_data())
    store = _store(settings, args.dry_run)
    competitions = parse_competitions(args.competitions)
    summary = run(
        client, store, competitions, triggered_by=args.triggered_by, secrets=settings.secrets()
    )
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


def _cmd_odds(args: argparse.Namespace, settings: Settings) -> int:
    client = OddsApiClient(settings.require_odds())
    store = _store(settings, args.dry_run)
    competitions = parse_competitions(args.competitions)
    summary = run_odds(
        client,
        store,
        competitions,
        mode=args.mode,
        triggered_by=args.triggered_by,
        secrets=settings.secrets(),
    )
    mode = "DRY RUN (nessuna scrittura)" if store is None else "scrittura su Supabase"
    print(
        f"The Odds API ({args.mode}) — {mode} — crediti usati: {client.credits_used}"
        f" — residui: {summary.remaining if summary.remaining is not None else 'n.d.'}"
    )
    for r in summary.results:
        line = f"  {r.code:<4} {r.status:<9} eventi={r.events} bookmaker={r.bookmakers}"
        if r.matched is not None:
            line += f" abbinati={r.matched}"
        if r.unknown_outcomes:
            line += f" esiti_non_squadra={r.unknown_outcomes}"
        if r.error:
            line += f" errore={r.error}"
        print(line)
    return 1 if summary.failed else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="predictra-collector")
    sub = parser.add_subparsers(dest="command", required=True)

    for name, help_text in (
        ("run", "partite e classifiche da football-data.org"),
        ("odds", "quote 1X2 da The Odds API"),
    ):
        cmd = sub.add_parser(name, help=help_text)
        cmd.add_argument("--competitions", help="codici separati da virgola (default: v1)")
        cmd.add_argument("--dry-run", action="store_true", help="non scrive su Supabase")
        cmd.add_argument(
            "--triggered-by", choices=["schedule", "manual"], default="manual", help="origine"
        )
        if name == "odds":
            cmd.add_argument("--mode", choices=["daily", "prematch"], default="daily")

    args = parser.parse_args(argv)
    try:
        settings = load_settings()
        handler = _cmd_odds if args.command == "odds" else _cmd_run
        return handler(args, settings)
    except ConfigError as exc:
        print(f"Configurazione: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
