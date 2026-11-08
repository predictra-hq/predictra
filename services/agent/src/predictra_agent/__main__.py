"""Riga di comando.

- ``python -m predictra_agent cycle --source github_actions --schedule agent-python``:
  un ciclo del worker (heartbeat, prelievo, esecuzione, retry, dead-letter).
- ``python -m predictra_agent enqueue --type agent.selftest --key <chiave> [--payload JSON]``:
  accoda un job in modo idempotente.

Variabili: ``SUPABASE_URL`` (o ``NEXT_PUBLIC_SUPABASE_URL``) e ``SUPABASE_SECRET_KEY``.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
from typing import cast

from .handlers import HANDLERS
from .queue import RunSource, SupabaseQueue
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
    summary = run_cycle(queue, HANDLERS, config, secrets=secrets)
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
