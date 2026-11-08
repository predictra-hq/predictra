"""Ciclo del worker (ADR 0003, ADR 0035).

Un ciclo:

1. apre un `agent_run` (heartbeat);
2. se c'è un budget di minuti (GitHub Actions), ne consuma 1 all'avvio; a budget
   esaurito il ciclo si chiude come `failed` senza prelevare nulla;
3. preleva un job alla volta (`claim_agent_jobs`, lease) tra i tipi che sa eseguire,
   finché ci sono job pronti, entro `max_jobs` e il tempo a disposizione;
4. per ogni job chiama il gestore: successo → `complete_agent_job`; errore →
   `fail_agent_job` (retry con backoff, o `dead` se esauriti o non recuperabile);
5. consuma i minuti effettivi e chiude il ciclo.

Un worker interrotto a metà lascia il job `running` con il lease: alla scadenza
`claim_agent_jobs` lo riprende (un altro tentativo). Per questo i gestori devono
essere idempotenti: rieseguire lo stesso job non deve duplicare dati. Le RPC di
scrittura di M2-M5 lo sono già; la chiave del job è `ctx.job.idempotency_key`.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from .queue import Job, LeaseLostError, Queue, QueueError, RunSource, RunStatus

MAX_ERROR_LENGTH = 2000


class PermanentJobError(Exception):
    """Errore non recuperabile (payload non valido, dato mancante): il job va subito in `dead`."""


@dataclass
class JobContext:
    job: Job
    _extend: Callable[[], None]

    def extend_lease(self) -> None:
        """Prolunga il lease: da chiamare nei job lunghi, prima della scadenza."""
        self._extend()


Handler = Callable[[JobContext], dict[str, Any] | None]


@dataclass(frozen=True)
class MinutesBudget:
    """Budget mensile di minuti (ADR 0035 §2): `provider` in `agent_rate_limits`."""

    quota: int
    provider: str = "github-actions"
    # Minuti fatturati fuori dal processo Python (checkout, installazione delle dipendenze).
    overhead_minutes: int = 1


@dataclass(frozen=True)
class CycleConfig:
    source: RunSource
    schedule: str
    worker_id: str
    max_jobs: int = 10
    lease_seconds: int = 900
    # Tempo massimo del ciclo: non si preleva un nuovo job se ne resta meno di un lease.
    time_budget_seconds: int = 1800
    minutes: MinutesBudget | None = None


@dataclass
class CycleSummary:
    run_id: int
    status: RunStatus
    claimed: int = 0
    done: int = 0
    failed: int = 0
    dead: int = 0
    lease_lost: int = 0
    budget_exhausted: bool = False
    errors: list[str] = field(default_factory=list)


def sanitize(message: str, secrets: tuple[str, ...]) -> str:
    """Toglie i segreti dal messaggio e lo tronca alla lunghezza ammessa dal database."""
    for secret in secrets:
        if secret:
            message = message.replace(secret, "***")
    return message[:MAX_ERROR_LENGTH]


def run_cycle(
    queue: Queue,
    handlers: Mapping[str, Handler],
    config: CycleConfig,
    *,
    secrets: tuple[str, ...] = (),
    clock: Callable[[], float] = time.monotonic,
) -> CycleSummary:
    started = clock()
    run_id = queue.start_run(config.source, config.schedule, config.worker_id)
    summary = CycleSummary(run_id=run_id, status="succeeded")
    infrastructure_error = False

    try:
        if config.minutes is not None and not queue.consume_quota(
            config.minutes.provider, "month", config.minutes.quota, 1
        ):
            summary.budget_exhausted = True
            summary.errors.append(
                f"Budget mensile esaurito ({config.minutes.provider}, "
                f"{config.minutes.quota} min): ciclo saltato"
            )
            infrastructure_error = True
        else:
            _process(queue, handlers, config, summary, secrets, clock, started)
    except QueueError as exc:
        infrastructure_error = True
        summary.errors.append(sanitize(str(exc), secrets))

    if infrastructure_error:
        summary.status = "failed"
    elif summary.failed or summary.lease_lost:
        summary.status = "partial"

    if config.minutes is not None and not summary.budget_exhausted:
        used = math.ceil((clock() - started) / 60) + config.minutes.overhead_minutes
        extra = max(used - 1, 0)
        if extra and not _consume(queue, config.minutes, extra):
            summary.errors.append(
                f"Budget mensile superato: {extra} min di questo ciclo non contati"
            )

    queue.finish_run(
        run_id,
        summary.status,
        jobs_claimed=summary.claimed,
        jobs_done=summary.done,
        jobs_failed=summary.failed + summary.lease_lost,
        error_summary=sanitize("; ".join(summary.errors), secrets) or None,
    )
    return summary


def _consume(queue: Queue, budget: MinutesBudget, minutes: int) -> bool:
    try:
        return queue.consume_quota(budget.provider, "month", budget.quota, minutes)
    except QueueError:
        return False


def _process(
    queue: Queue,
    handlers: Mapping[str, Handler],
    config: CycleConfig,
    summary: CycleSummary,
    secrets: tuple[str, ...],
    clock: Callable[[], float],
    started: float,
) -> None:
    types = sorted(handlers)
    while summary.claimed < config.max_jobs:
        remaining = config.time_budget_seconds - (clock() - started)
        if remaining < config.lease_seconds:
            break
        jobs = queue.claim(
            config.worker_id,
            limit=1,
            lease_seconds=config.lease_seconds,
            types=types,
            run_id=summary.run_id,
        )
        if not jobs:
            break
        job = jobs[0]
        summary.claimed += 1
        _execute(queue, handlers[job.type], job, config, summary, secrets)


def _execute(
    queue: Queue,
    handler: Handler,
    job: Job,
    config: CycleConfig,
    summary: CycleSummary,
    secrets: tuple[str, ...],
) -> None:
    ctx = JobContext(
        job, lambda: queue.extend_lease(job.id, config.worker_id, config.lease_seconds)
    )
    try:
        try:
            result = handler(ctx)
        except PermanentJobError as exc:
            _fail(queue, job, config, summary, sanitize(_describe(exc), secrets), False)
            return
        except Exception as exc:
            _fail(queue, job, config, summary, sanitize(_describe(exc), secrets), True)
            return
        queue.complete(job.id, config.worker_id, result)
        summary.done += 1
    except LeaseLostError:
        # Il lease è scaduto durante l'esecuzione e un altro worker ha ripreso il job:
        # l'esito di questo tentativo non conta (il gestore è idempotente).
        summary.lease_lost += 1
        summary.errors.append(f"Job {job.id} ({job.type}): lease perso")


def _fail(
    queue: Queue,
    job: Job,
    config: CycleConfig,
    summary: CycleSummary,
    error: str,
    retryable: bool,
) -> None:
    status = queue.fail(job.id, config.worker_id, error, retryable=retryable)
    summary.failed += 1
    if status == "dead":
        summary.dead += 1
    summary.errors.append(f"Job {job.id} ({job.type}): {error}")


def _describe(exc: BaseException) -> str:
    text = str(exc)
    return f"{type(exc).__name__}: {text}" if text else type(exc).__name__
