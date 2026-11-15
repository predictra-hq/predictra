"""Riga di comando: ``python -m predictra_bet_builder run [--dry-run] [--horizon-days 10]``.

Variabili: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SECRET_KEY,
CODE_COMMIT (SHA del codice del servizio).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import UTC, datetime

from .pipeline import run
from .rules import DEFAULT_RULES
from .store import SupabaseStore


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="predictra-bet-builder")
    sub = parser.add_subparsers(dest="command", required=True)
    cmd = sub.add_parser("run", help="genera e salva le proposte del Bet Builder")
    cmd.add_argument("--dry-run", action="store_true", help="legge i dati ma non scrive nulla")
    cmd.add_argument("--horizon-days", type=int, default=10, help="giorni di partite considerati")
    cmd.add_argument("--triggered-by", choices=["schedule", "manual"], default="manual")
    args = parser.parse_args(argv)

    url = (
        os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or ""
    ).strip()
    key = (os.environ.get("SUPABASE_SECRET_KEY") or "").strip()
    commit = (os.environ.get("CODE_COMMIT") or os.environ.get("GITHUB_SHA") or "").strip().lower()
    if not url.startswith("https://") or not key:
        print(
            "Configurazione: servono SUPABASE_URL (https) e SUPABASE_SECRET_KEY.", file=sys.stderr
        )
        return 2
    if not re.fullmatch(r"[0-9a-f]{7,40}", commit):
        print("Configurazione: CODE_COMMIT deve essere lo SHA git del codice.", file=sys.stderr)
        return 2
    if not 1 <= args.horizon_days <= 14:
        print("--horizon-days deve essere tra 1 e 14.", file=sys.stderr)
        return 2

    summary = run(
        SupabaseStore(url.rstrip("/"), key),
        DEFAULT_RULES,
        now=datetime.now(UTC),
        code_commit=commit,
        horizon_days=args.horizon_days,
        triggered_by=args.triggered_by,
        dry_run=args.dry_run,
    )
    if summary.skipped_reason:
        print(f"Bet Builder — nessuna run: {summary.skipped_reason}.")
        return 0
    mode = "DRY RUN (nessuna scrittura)" if args.dry_run else f"run {summary.run_id}"
    print(
        f"Bet Builder — {mode} — modello {summary.model_version_id} — partite {summary.fixtures}"
        f" — selezioni con quota {summary.legs} — combinazioni valutate {summary.candidates}"
        f" — proposte {len(summary.proposals)} (scritte {summary.written})"
    )
    for p in summary.proposals:
        print(
            f"  {p.slate_date} {p.category:<12} #{p.rank} selezioni={len(p.legs)}"
            f" p={p.probability} quota={p.combined_price} EV={p.expected_value}"
            f" C={p.confidence} score={p.rank_score:.4f}"
        )
    if not summary.proposals:
        print("  Nessuna combinazione supera le soglie: zero proposte (ADR 0025 §4).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
