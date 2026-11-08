"""Job `bet-builder.run` (M7 fase A5): proposte dello Smart Bet Builder dalla coda.

Il lavoro vero resta in `services/bet-builder` (`predictra_bet_builder.pipeline.run`,
ADR 0025-0027): qui solo l'adattatore alla coda.

- Due finestre al giorno (UTC), come gli schedule precedenti (07:53 e 17:07), dopo le
  quote: `morning` dalle 06 alle 15 (ciclo delle 06:47, dopo `odds.collect:daily`) ed
  `evening` dalle 15 alle 21 (ciclo delle 15:47, dopo `odds.collect:prematch`). Nel ciclo
  il job viene dopo le quote, perché accodato dopo.
  Chiave `bet-builder.run:<finestra>:<AAAA-MM-GG>`: una esecuzione per finestra.
- Versione del codice: `BET_BUILDER_COMMIT`, l'ultimo commit che ha toccato
  `services/bet-builder`, calcolato dal workflow come prima. SHA non valido → dead-letter.
- Senza modello attivo il motore non apre una run (`skipped_reason`): il job si completa
  e lo dichiara, è il comportamento voluto (nessuna schedina forzata, ADR 0025 §4).
- Ogni esecuzione apre una nuova run del Bet Builder: `MAX_ATTEMPTS` = 2.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from datetime import UTC, date, datetime, time
from typing import Any

from predictra_bet_builder.pipeline import run
from predictra_bet_builder.rules import DEFAULT_RULES
from predictra_bet_builder.store import SupabaseStore

from .worker import Handler, JobContext, PermanentJobError

JOB_TYPE = "bet-builder.run"
MAX_ATTEMPTS = 2
HORIZON_DAYS = 7
WINDOWS: dict[str, tuple[int, int]] = {"morning": (6, 15), "evening": (15, 21)}
COMMIT_RE = re.compile(r"[0-9a-f]{7,40}")

Engine = Callable[..., Any]


def _window(name: str, day: date) -> tuple[datetime, datetime]:
    start_h, end_h = WINDOWS[name]
    return (
        datetime.combine(day, time(start_h), tzinfo=UTC),
        datetime.combine(day, time(end_h), tzinfo=UTC),
    )


def planned_jobs(now: datetime) -> list[tuple[str, str, dict[str, Any], int]]:
    """(tipo, chiave, payload, max_attempts) del job la cui finestra contiene `now`."""
    now = now.astimezone(UTC)
    jobs = []
    for name in WINDOWS:
        start, end = _window(name, now.date())
        if start <= now < end:
            day = now.date().isoformat()
            payload = {"window": name, "date": day}
            jobs.append((JOB_TYPE, f"{JOB_TYPE}:{name}:{day}", payload, MAX_ATTEMPTS))
    return jobs


def make_handler(
    env: Mapping[str, str],
    *,
    supabase_url: str,
    supabase_secret_key: str,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
    engine: Engine = run,
) -> Handler:
    def handle(ctx: JobContext) -> dict[str, Any]:
        payload = ctx.job.payload
        name = payload.get("window")
        if name not in WINDOWS:
            raise PermanentJobError("window deve essere morning o evening")
        try:
            day = date.fromisoformat(str(payload["date"]))
        except (KeyError, ValueError):
            raise PermanentJobError("date mancante o non valida") from None
        start, end = _window(name, day)
        current = now()
        if not start <= current < end:
            return {"skipped": "fuori finestra", "window": name, "date": day.isoformat()}

        commit = (env.get("BET_BUILDER_COMMIT") or "").strip().lower()
        if not COMMIT_RE.fullmatch(commit):
            raise PermanentJobError(
                "BET_BUILDER_COMMIT mancante o non valido: serve lo SHA dell'ultimo commit "
                "del Bet Builder"
            )

        summary = engine(
            SupabaseStore(supabase_url, supabase_secret_key),
            DEFAULT_RULES,
            now=current,
            code_commit=commit,
            horizon_days=HORIZON_DAYS,
            triggered_by="schedule",
            dry_run=False,
        )
        result: dict[str, Any] = {"window": name, "date": day.isoformat(), "code_commit": commit}
        if summary.skipped_reason:
            return {**result, "skipped": summary.skipped_reason}
        return {
            **result,
            "run_id": summary.run_id,
            "model_version_id": summary.model_version_id,
            "fixtures": summary.fixtures,
            "candidates": summary.candidates,
            "proposals": len(summary.proposals),
            "written": summary.written,
        }

    return handle
