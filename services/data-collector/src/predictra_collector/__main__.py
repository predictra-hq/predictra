"""Riga di comando.

- ``python -m predictra_collector run [--competitions SA,PL] [--dry-run]``: football-data.org
- ``python -m predictra_collector odds [--mode daily|prematch] [--competitions SA] [--dry-run]``:
  quote 1X2 da The Odds API
- ``python -m predictra_collector api-football-probe``: verifica del piano API-Football
  (stagioni accessibili); non scrive nulla, al massimo 6 richieste
- ``python -m predictra_collector api-football-backfill [--competitions SA] [--dry-run]``:
  storico 2022-2024 da API-Football (M2 fase A3), al massimo 32 richieste
"""

from __future__ import annotations

import argparse
import sys

from .api_football import ApiFootballClient, ApiFootballError, probe
from .api_football_backfill import backfill
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


def _cmd_api_football_probe(args: argparse.Namespace, settings: Settings) -> int:
    client = ApiFootballClient(settings.require_api_football())
    try:
        report = probe(client)
    except ApiFootballError as exc:
        print(f"API-Football — verifica non riuscita: {exc}", file=sys.stderr)
        return 1
    print(
        f"API-Football — piano: {report.plan} — attivo: {report.active} — "
        f"richieste oggi: {report.requests_today}/{report.limit_day} — "
        f"usate da questa verifica: {client.requests_used}"
    )
    if report.league_id is None:
        print("  Competizione di prova non trovata")
        return 1
    print(f"  {report.league_name} (id {report.league_id})")
    for s in report.seasons[-8:]:
        print(
            f"    stagione {s.year}: corrente={s.current} formazioni={s.lineups} "
            f"statistiche={s.statistics_fixtures}"
        )
    for year, result in report.access.items():
        outcome = f"{result} partite" if isinstance(result, int) else f"NON accessibile: {result}"
        print(f"    accesso {year}: {outcome}")
    return 0


def _cmd_api_football_backfill(args: argparse.Namespace, settings: Settings) -> int:
    client = ApiFootballClient(settings.require_api_football())
    store = _store(settings, args.dry_run)
    competitions = parse_competitions(args.competitions)
    summary = backfill(
        client, store, competitions, triggered_by=args.triggered_by, secrets=settings.secrets()
    )
    mode = "DRY RUN (nessuna scrittura)" if store is None else "scrittura su Supabase"
    print(
        f"API-Football backfill — {mode} — richieste: {summary.requests_used} — "
        f"residue oggi: {client.day_remaining if client.day_remaining is not None else 'n.d.'}"
    )
    if summary.skipped:
        print(f"  già fatte: {', '.join(summary.skipped)}")
    for r in summary.results:
        line = (
            f"  {r.code:<4} {r.year} {r.status:<9} partite={r.matches} "
            f"squadre_abbinate={r.teams_matched} non_abbinate={r.teams_unmatched} "
            f"problemi={r.issues}"
        )
        if r.error:
            line += f" errore={r.error}"
        print(line)
    if summary.stopped:
        print(f"  fermato: {summary.stopped} (si riprende domani da qui)")
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

    sub.add_parser(
        "api-football-probe", help="verifica del piano API-Football (stagioni accessibili)"
    )
    bf = sub.add_parser("api-football-backfill", help="storico 2022-2024 da API-Football")
    bf.add_argument("--competitions", help="codici separati da virgola (default: v1)")
    bf.add_argument("--dry-run", action="store_true", help="non scrive su Supabase")
    bf.add_argument("--triggered-by", choices=["schedule", "manual"], default="manual")

    args = parser.parse_args(argv)
    try:
        settings = load_settings()
        handlers = {
            "run": _cmd_run,
            "odds": _cmd_odds,
            "api-football-probe": _cmd_api_football_probe,
            "api-football-backfill": _cmd_api_football_backfill,
        }
        handler = handlers[args.command]
        return handler(args, settings)
    except ConfigError as exc:
        print(f"Configurazione: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
