"""Riga di comando: ``python -m predictra_engine run [--dry-run] [--horizon-days 7]``.

Variabili: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SECRET_KEY,
CODE_COMMIT (SHA del codice; in GitHub Actions è GITHUB_SHA).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import UTC, datetime

from .models import all_models
from .pipeline import run
from .store import SupabaseStore


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="predictra-engine")
    sub = parser.add_subparsers(dest="command", required=True)
    cmd = sub.add_parser(
        "run", help="adatta i modelli, esegue i backtest nuovi e scrive le previsioni"
    )
    cmd.add_argument("--dry-run", action="store_true", help="legge i dati ma non scrive nulla")
    cmd.add_argument("--horizon-days", type=int, default=7, help="giorni di partite da prevedere")
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

    store = SupabaseStore(url.rstrip("/"), key)
    summary = run(
        store,
        all_models(),
        now=datetime.now(UTC),
        code_commit=commit,
        horizon_days=args.horizon_days,
        triggered_by=args.triggered_by,
        dry_run=args.dry_run,
    )
    mode = "DRY RUN (nessuna scrittura)" if args.dry_run else "scrittura su Supabase"
    print(
        f"Motore — {mode} — as_of {summary.as_of.isoformat()} — partite di addestramento "
        f"{summary.training_matches} — partite da prevedere {summary.fixtures}"
    )
    for m in summary.models:
        line = f"  {m.key:<12} {m.version:<32} partite={m.matches} righe={m.predictions}"
        if m.backtest:
            bt = m.backtest
            line += (
                f" backtest[{bt.matches} partite: Brier={bt.brier:.4f} LogLoss={bt.log_loss:.4f}"
                f" ECE={bt.ece:.4f}{' registrato' if m.backtest_recorded else ''}]"
            )
        if m.error:
            line += f" errore={m.error}"
        print(line)
    return 1 if summary.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
