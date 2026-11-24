"""Client della coda dell'agente: funzioni RPC della migrazione 20261108150000_agent.sql.

Usa la chiave secret (service_role) via PostgREST, come i collector: solo lato
server, mai nei log. Funzioni e codici d'errore: docs/data-dictionary/agent.md.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, Protocol

import httpx

RunSource = Literal["qstash", "github_actions", "manual"]
RunStatus = Literal["succeeded", "partial", "failed"]
QuotaWindow = Literal["minute", "hour", "day", "month"]


class QueueError(RuntimeError):
    """Errore restituito dal database. Non contiene mai la chiave."""

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code


class LeaseLostError(QueueError):
    """Il worker non possiede più il job (lease scaduto e ripreso da un altro): SQLSTATE 55000."""


@dataclass(frozen=True)
class Job:
    id: int
    type: str
    idempotency_key: str
    payload: dict[str, Any]
    attempts: int
    max_attempts: int

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> Job:
        return cls(
            id=int(row["id"]),
            type=str(row["type"]),
            idempotency_key=str(row["idempotency_key"]),
            payload=dict(row.get("payload") or {}),
            attempts=int(row["attempts"]),
            max_attempts=int(row["max_attempts"]),
        )


@dataclass(frozen=True)
class Enqueued:
    job_id: int
    created: bool
    status: str


class Queue(Protocol):
    """Operazioni della coda usate dal worker (implementate da SupabaseQueue e dai test)."""

    def start_run(self, source: RunSource, schedule: str, worker_id: str) -> int: ...

    def finish_run(
        self,
        run_id: int,
        status: RunStatus,
        *,
        jobs_claimed: int,
        jobs_done: int,
        jobs_failed: int,
        error_summary: str | None,
    ) -> None: ...

    def claim(
        self, worker_id: str, *, limit: int, lease_seconds: int, types: list[str], run_id: int
    ) -> list[Job]: ...

    def extend_lease(self, job_id: int, worker_id: str, lease_seconds: int) -> None: ...

    def complete(self, job_id: int, worker_id: str, result: dict[str, Any] | None) -> None: ...

    def fail(self, job_id: int, worker_id: str, error: str, *, retryable: bool) -> str: ...

    def consume_quota(self, provider: str, window: QuotaWindow, quota: int, cost: int) -> bool: ...


@dataclass
class SupabaseQueue:
    url: str
    secret_key: str
    http: httpx.Client = field(default_factory=lambda: httpx.Client(timeout=30.0))

    def _headers(self) -> dict[str, str]:
        headers = {"apikey": self.secret_key, "Content-Type": "application/json"}
        # Chiavi legacy (JWT service_role) anche nell'header Authorization;
        # le chiavi sb_secret_ solo come apikey (come supabase_store dei collector).
        if self.secret_key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {self.secret_key}"
        return headers

    def rpc(self, name: str, params: dict[str, Any]) -> Any:
        try:
            response = self.http.post(
                f"{self.url}/rest/v1/rpc/{name}", json=params, headers=self._headers()
            )
        except httpx.HTTPError as exc:
            raise QueueError(f"Supabase {name}: {type(exc).__name__}") from None
        if response.status_code >= 400:
            code = detail = None
            try:
                body = response.json()
                if isinstance(body, dict):
                    detail, code = body.get("message"), body.get("code")
            except ValueError:
                pass
            message = f"Supabase {name}: HTTP {response.status_code} {detail or ''}".strip()
            if code == "55000":
                raise LeaseLostError(message, code)
            raise QueueError(message, code)
        return response.json() if response.content else None

    def last_dead_error(self, job_type: str, since: datetime) -> str | None:
        """Errore dell'ultimo job di questo tipo finito in `dead` dopo `since`, se c'è."""
        try:
            response = self.http.get(
                f"{self.url}/rest/v1/agent_jobs",
                params={
                    "select": "last_error",
                    "type": f"eq.{job_type}",
                    "status": "eq.dead",
                    "finished_at": f"gte.{since.isoformat()}",
                    "order": "finished_at.desc",
                    "limit": "1",
                },
                headers=self._headers(),
            )
        except httpx.HTTPError as exc:
            raise QueueError(f"Supabase agent_jobs: {type(exc).__name__}") from None
        if response.status_code >= 400:
            raise QueueError(f"Supabase agent_jobs: HTTP {response.status_code}")
        rows = response.json() or []
        return str(rows[0].get("last_error") or "") or None if rows else None

    def enqueue(
        self,
        job_type: str,
        idempotency_key: str,
        payload: dict[str, Any] | None = None,
        *,
        run_at: str | None = None,
        max_attempts: int = 5,
    ) -> Enqueued:
        rows = self.rpc(
            "enqueue_agent_job",
            {
                "p_type": job_type,
                "p_idempotency_key": idempotency_key,
                "p_payload": payload or {},
                "p_run_at": run_at,
                "p_max_attempts": max_attempts,
            },
        )
        row = rows[0]
        return Enqueued(int(row["job_id"]), bool(row["created"]), str(row["status"]))

    def start_run(self, source: RunSource, schedule: str, worker_id: str) -> int:
        return int(
            self.rpc(
                "start_agent_run",
                {"p_source": source, "p_schedule": schedule, "p_worker_id": worker_id},
            )
        )

    def finish_run(
        self,
        run_id: int,
        status: RunStatus,
        *,
        jobs_claimed: int,
        jobs_done: int,
        jobs_failed: int,
        error_summary: str | None,
    ) -> None:
        self.rpc(
            "finish_agent_run",
            {
                "p_run_id": run_id,
                "p_status": status,
                "p_jobs_claimed": jobs_claimed,
                "p_jobs_done": jobs_done,
                "p_jobs_failed": jobs_failed,
                "p_error_summary": error_summary,
            },
        )

    def claim(
        self, worker_id: str, *, limit: int, lease_seconds: int, types: list[str], run_id: int
    ) -> list[Job]:
        rows = self.rpc(
            "claim_agent_jobs",
            {
                "p_worker_id": worker_id,
                "p_limit": limit,
                "p_lease_seconds": lease_seconds,
                "p_types": types,
                "p_run_id": run_id,
            },
        )
        return [Job.from_row(r) for r in rows or []]

    def extend_lease(self, job_id: int, worker_id: str, lease_seconds: int) -> None:
        self.rpc(
            "extend_agent_job_lease",
            {"p_job_id": job_id, "p_worker_id": worker_id, "p_lease_seconds": lease_seconds},
        )

    def complete(self, job_id: int, worker_id: str, result: dict[str, Any] | None) -> None:
        self.rpc(
            "complete_agent_job",
            {"p_job_id": job_id, "p_worker_id": worker_id, "p_result": result},
        )

    def fail(self, job_id: int, worker_id: str, error: str, *, retryable: bool) -> str:
        return str(
            self.rpc(
                "fail_agent_job",
                {
                    "p_job_id": job_id,
                    "p_worker_id": worker_id,
                    "p_error": error,
                    "p_retryable": retryable,
                },
            )
        )

    def watchdog(self) -> int:
        """`agent_watchdog()`: notifica i monitor se una sorgente è degradata (fase A4)."""
        return int(self.rpc("agent_watchdog", {}) or 0)

    def consume_quota(self, provider: str, window: QuotaWindow, quota: int, cost: int) -> bool:
        return bool(
            self.rpc(
                "consume_agent_quota",
                {"p_provider": provider, "p_window": window, "p_quota": quota, "p_cost": cost},
            )
        )
