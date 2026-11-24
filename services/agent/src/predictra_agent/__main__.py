"""Riga di comando.

- ``python -m predictra_agent cycle --source github_actions --schedule agent-python``:
  un ciclo del worker (heartbeat, prelievo, esecuzione, retry, dead-letter).
  Con ``--plan football-data``, ``odds``, ``predictions`` e ``bet-builder`` prima accoda,
  in modo idempotente e in quest'ordine, i job della finestra corrente (fase A5).
- ``python -m predictra_agent enqueue --type <tipo> --key <chiave> [--payload JSON]``:
  accoda un job in modo idempotente (es. ``--type agent.selftest.python``).

Variabili: ``SUPABASE_URL`` (o ``NEXT_PUBLIC_SUPABASE_URL``) e ``SUPABASE_SECRET_KEY``;
``FOOTBALL_DATA_API_KEY`` e ``ODDS_API_KEY`` per i job di raccolta, ``PREDICTION_ENGINE_COMMIT``
e ``BET_BUILDER_COMMIT`` (SHA dell'ultimo commit di ciascun servizio) per previsioni e proposte.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
from datetime import UTC, datetime
from typing import cast

from . import api_football_details, bet_builder, football_data, odds, predictions
from .handlers import build_handlers
from .queue import QueueError, RunSource, SupabaseQueue
from .worker import CycleConfig, MinutesBudget, run_cycle


class ConfigError(RuntimeError):
    """Configurazione mancante o non valida."""


def _queue(env: dict[str, str]) -> tuple[SupabaseQueue, tuple[str, ...]]:
    url = (env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (env.get("SUPABASE_SECRET_KEY") or "").strip()
    if not url or not key:
        raise ConfigError(
            "Servono SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SECRET_KEY."
        )
    if not url.startswith("https://"):
        raise ConfigError("SUPABASE_URL deve iniziare con https://")
    return SupabaseQueue(url.rstrip("/"), key), (key,)


def default_worker_id(env: dict[str, str]) -> str:
    run_id = env.get("GITHUB_RUN_ID")
    if run_id:
        return f"gha-{run_id}-{env.get('GITHUB_RUN_ATTEMPT', '1')}"
    return f"{socket.gethostname()}-{os.getpid()}"


def _cmd_cycle(args: argparse.Namespace, env: dict[str, str]) -> int:
    queue, secrets = _queue(env)
    minutes = MinutesBudget(quota=args.minutes_quota) if args.minutes_quota else None
    config = CycleConfig(
        source=cast(RunSource, args.source),
        schedule=args.schedule,
        worker_id=args.worker_id or default_worker_id(env),
        max_jobs=args.max_jobs,
        lease_seconds=args.lease_seconds,
        time_budget_seconds=args.time_budget,
        minutes=minutes,
    )
    now = datetime.now(UTC)
    planned: list[tuple[str, str, dict[str, object], int]] = []
    if "football-data" in args.plan:
        planned.append((*football_data.planned_job(now), 5))
        # Statistiche e formazioni API-Football (ADR 0012): un job al giorno, se c'è la chiave
        # e solo da un IP non condiviso (ADR 0069): mai dai runner ospitati da GitHub.
        if (env.get("API_FOOTBALL_KEY") or "").strip() and api_football_details.egress_allowed(env):
            planned.append(api_football_details.planned_job(now))
    if "odds" in args.plan:
        planned.extend(odds.planned_jobs(now))
    if "predictions" in args.plan:
        # Dopo football-data: nello stesso ciclo viene prelevato dopo la raccolta.
        planned.extend(predictions.planned_jobs(now))
    if "bet-builder" in args.plan:
        # Ultimo: nello stesso ciclo viene prelevato dopo quote e previsioni.
        planned.extend(bet_builder.planned_jobs(now))
    for job_type, key, payload, max_attempts in planned:
        try:
            result = queue.enqueue(job_type, key, payload, max_attempts=max_attempts)
            state = "accodato" if result.created else f"già presente ({result.status})"
            print(f"Piano: {key} {state}")
        except QueueError as exc:
            # Il ciclo parte comunque: preleva i job già in coda.
            print(f"Piano non riuscito per {key}: {exc}")
    provider_keys = tuple(
        k
        for k in (
            (env.get(n) or "").strip()
            for n in ("FOOTBALL_DATA_API_KEY", "ODDS_API_KEY", "API_FOOTBALL_KEY")
        )
        if k
    )
    handlers = build_handlers(env, supabase_url=queue.url, supabase_secret_key=queue.secret_key)
    secrets = (*secrets, *provider_keys)
    summary = run_cycle(queue, handlers, config, secrets=secrets)
    try:
        # Fase A4: se una sorgente è degradata (anche QStash), i monitor ricevono una notifica.
        notified = queue.watchdog()
        if notified:
            print(f"Watchdog: {notified} notifiche ai monitor")
    except QueueError as exc:
        print(f"Watchdog non riuscito: {exc}")
    print(
        f"Ciclo {summary.run_id} ({config.source}/{config.schedule}) — {summary.status}: "
        f"prelevati={summary.claimed} completati={summary.done} falliti={summary.failed} "
        f"dead={summary.dead} lease_persi={summary.lease_lost}"
    )
    for error in summary.errors:
        print(f"  {error}")
    return 1 if summary.status == "failed" else 0


def _cmd_enqueue(args: argparse.Namespace, env: dict[str, str]) -> int:
    queue, _ = _queue(env)
    try:
        payload = json.loads(args.payload) if args.payload else {}
    except json.JSONDecodeError as exc:
        raise ConfigError(f"--payload non è JSON valido: {exc.msg}") from None
    if not isinstance(payload, dict):
        raise ConfigError("--payload deve essere un oggetto JSON")
    result = queue.enqueue(args.type, args.key, payload, max_attempts=args.max_attempts)
    state = "accodato" if result.created else "già presente"
    print(f"Job {result.job_id} {state} (stato {result.status})")
    return 0


def main(argv: list[str] | None = None, env: dict[str, str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="predictra-agent")
    sub = parser.add_subparsers(dest="command", required=True)

    cycle = sub.add_parser("cycle", help="esegue un ciclo del worker")
    cycle.add_argument("--source", choices=["github_actions", "manual"], default="manual")
    cycle.add_argument("--schedule", default="agent-python")
    cycle.add_argument("--worker-id", default=None)
    cycle.add_argument("--max-jobs", type=int, default=10)
    cycle.add_argument("--lease-seconds", type=int, default=900)
    cycle.add_argument("--time-budget", type=int, default=1800, help="secondi massimi del ciclo")
    cycle.add_argument(
        "--plan",
        action="append",
        choices=["football-data", "odds", "predictions", "bet-builder"],
        default=[],
        help="accoda il job della finestra corrente prima del ciclo (ripetibile)",
    )
    cycle.add_argument(
        "--minutes-quota",
        type=int,
        default=0,
        help="budget mensile di minuti GitHub Actions (ADR 0035); 0 = non contare",
    )

    enqueue = sub.add_parser("enqueue", help="accoda un job (idempotente)")
    enqueue.add_argument("--type", required=True)
    enqueue.add_argument("--key", required=True)
    enqueue.add_argument("--payload", default=None)
    enqueue.add_argument("--max-attempts", type=int, default=5)

    args = parser.parse_args(argv)
    source_env = dict(os.environ) if env is None else env
    try:
        if args.command == "cycle":
            return _cmd_cycle(args, source_env)
        return _cmd_enqueue(args, source_env)
    except ConfigError as exc:
        print(f"Errore di configurazione: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
