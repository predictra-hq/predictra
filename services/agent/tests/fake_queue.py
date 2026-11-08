"""Coda in memoria con le stesse regole delle RPC di 20261108150000_agent.sql.

Le regole SQL (SKIP LOCKED, vincoli, RLS) sono verificate da supabase/tests/agent.test.ts;
qui servono a provare il comportamento del worker: lease, ripresa, retry e dead-letter.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from predictra_agent.queue import Enqueued, Job, LeaseLostError, QueueError


@dataclass
class Row:
    id: int
    type: str
    key: str
    payload: dict[str, Any]
    max_attempts: int
    status: str = "queued"
    attempts: int = 0
    next_run_at: float = 0.0
    locked_by: str | None = None
    locked_until: float | None = None
    last_error: str | None = None
    result: dict[str, Any] | None = None


@dataclass
class FakeClock:
    now: float = 1_000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@dataclass
class FakeQueue:
    clock: FakeClock
    backoff_seconds: float = 60.0
    jobs: dict[int, Row] = field(default_factory=dict)
    runs: dict[int, dict[str, Any]] = field(default_factory=dict)
    quota_used: dict[tuple[str, str], int] = field(default_factory=dict)
    fail_claim: bool = False

    # -- accodamento ---------------------------------------------------------
    def enqueue(
        self, job_type: str, key: str, payload: dict[str, Any] | None = None, max_attempts: int = 5
    ) -> Enqueued:
        for row in self.jobs.values():
            if row.key == key:
                if row.type != job_type:
                    raise QueueError("chiave di un altro tipo", "23505")
                return Enqueued(row.id, False, row.status)
        row = Row(len(self.jobs) + 1, job_type, key, payload or {}, max_attempts)
        row.next_run_at = self.clock.now
        self.jobs[row.id] = row
        return Enqueued(row.id, True, "queued")

    # -- cicli ---------------------------------------------------------------
    def start_run(self, source: str, schedule: str, worker_id: str) -> int:
        run_id = len(self.runs) + 1
        self.runs[run_id] = {"source": source, "schedule": schedule, "status": "running"}
        return run_id

    def finish_run(self, run_id: int, status: str, **counts: Any) -> None:
        run = self.runs[run_id]
        if run["status"] != "running":
            raise QueueError("ciclo già chiuso", "P0002")
        run.update(status=status, **counts)

    # -- prelievo ------------------------------------------------------------
    def recover_expired(self) -> int:
        count = 0
        for row in self.jobs.values():
            expired = row.locked_until is not None and row.locked_until < self.clock.now
            if row.status == "running" and expired:
                row.status = "dead" if row.attempts >= row.max_attempts else "failed"
                row.last_error = f"Lease scaduto (worker {row.locked_by} interrotto)"
                row.locked_by = row.locked_until = None
                row.next_run_at = self.clock.now
                count += 1
        return count

    def claim(
        self, worker_id: str, *, limit: int, lease_seconds: int, types: list[str], run_id: int
    ) -> list[Job]:
        if self.fail_claim:
            raise QueueError("Supabase claim_agent_jobs: HTTP 503")
        self.recover_expired()
        ready = sorted(
            (
                r
                for r in self.jobs.values()
                if r.status in ("queued", "failed")
                and r.next_run_at <= self.clock.now
                and r.type in types
            ),
            key=lambda r: (r.next_run_at, r.id),
        )[:limit]
        out = []
        for row in ready:
            row.status, row.attempts = "running", row.attempts + 1
            row.locked_by, row.locked_until = worker_id, self.clock.now + lease_seconds
            out.append(
                Job(row.id, row.type, row.key, dict(row.payload), row.attempts, row.max_attempts)
            )
        return out

    def _owned(self, job_id: int, worker_id: str) -> Row:
        row = self.jobs[job_id]
        if row.status != "running" or row.locked_by != worker_id:
            raise LeaseLostError("lease perso", "55000")
        return row

    def extend_lease(self, job_id: int, worker_id: str, lease_seconds: int) -> None:
        row = self._owned(job_id, worker_id)
        if row.locked_until is not None and row.locked_until < self.clock.now:
            raise LeaseLostError("lease perso", "55000")
        row.locked_until = self.clock.now + lease_seconds

    def complete(self, job_id: int, worker_id: str, result: dict[str, Any] | None) -> None:
        row = self._owned(job_id, worker_id)
        row.status, row.result, row.last_error = "done", result, None
        row.locked_by = row.locked_until = None

    def fail(self, job_id: int, worker_id: str, error: str, *, retryable: bool) -> str:
        row = self._owned(job_id, worker_id)
        row.last_error = error
        row.locked_by = row.locked_until = None
        if not retryable or row.attempts >= row.max_attempts:
            row.status = "dead"
        else:
            row.status = "failed"
            row.next_run_at = self.clock.now + self.backoff_seconds * 2 ** (row.attempts - 1)
        return row.status

    def consume_quota(self, provider: str, window: str, quota: int, cost: int) -> bool:
        used = self.quota_used.get((provider, window), 0)
        if used + cost > quota:
            return False
        self.quota_used[(provider, window)] = used + cost
        return True
