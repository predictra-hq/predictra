"""Ciclo di raccolta football-data.org: una esecuzione (ingestion_runs) per competizione."""

from __future__ import annotations

import contextlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from .football_data import PROVIDER, FootballDataClient, normalize_competition

JOB_TYPE = "fd.competition"


class Store(Protocol):
    def start_run(
        self, provider: str, job_type: str, window_key: str, triggered_by: str
    ) -> int: ...
    def ingest(self, run_id: int, batch: dict[str, Any]) -> dict[str, Any]: ...
    def report_issues(self, run_id: int, issues: list[dict[str, Any]]) -> None: ...
    def resolve_issues(
        self, run_id: int, check_codes: tuple[str, ...], provider_entity_ids: list[str]
    ) -> None: ...
    def finish_run(
        self,
        run_id: int,
        status: str,
        *,
        requests_used: int,
        rows_upserted: int,
        error_count: int,
        error_summary: str | None,
    ) -> None: ...


@dataclass
class CompetitionResult:
    code: str
    status: str
    matches: int = 0
    teams: int = 0
    standings: int = 0
    issues: int = 0
    error: str | None = None


@dataclass
class RunSummary:
    results: list[CompetitionResult] = field(default_factory=list)

    @property
    def failed(self) -> bool:
        return any(r.status == "FAILED" for r in self.results)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


# Controlli sul punteggio: chiusi da soli quando la partita torna senza problemi (ADR 0034).
SCORE_CHECKS = ("match.score_missing", "match.score_non_regular", "match.score_unexpected")
# Tutti i controlli su una partita (ADR 0065): si chiudono da soli quando la partita torna
# senza quel problema, per esempio un turno a eliminazione diretta che ora ha le squadre.
MATCH_CHECKS = (
    *SCORE_CHECKS,
    "match.teams_undefined",
    "match.status_unknown",
    "match.payload_incomplete",
    "match.same_team",
)


def resolvable_matches(batch: dict[str, Any] | None, issues: list[dict[str, Any]]) -> list[str]:
    """ID provider delle partite del lotto senza problemi di punteggio in questa raccolta."""
    if not batch:
        return []
    flagged = {
        i.get("provider_entity_id")
        for i in issues
        if i.get("entity_type") == "match" and i.get("check_code") in MATCH_CHECKS
    }
    return [m["provider_id"] for m in batch.get("matches") or [] if m["provider_id"] not in flagged]


def sanitize(message: str, secrets: tuple[str, ...]) -> str:
    """Rimuove eventuali segreti da un messaggio d'errore e lo accorcia."""
    for secret in secrets:
        if secret:
            message = message.replace(secret, "***")
    return message[:500]


def collect_competition(
    client: FootballDataClient, code: str, observed_at: str | None = None
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Scarica partite e classifica della stagione corrente e le normalizza."""
    observed = observed_at or _now()
    matches = client.competition_matches(code)
    standings = client.competition_standings(code)  # None per coppe senza classifica (404)
    normalized = normalize_competition(matches, standings, observed)
    return normalized.batch, normalized.issues


def run(
    client: FootballDataClient,
    store: Store | None,
    competitions: tuple[str, ...],
    *,
    triggered_by: str = "schedule",
    secrets: tuple[str, ...] = (),
) -> RunSummary:
    """Esegue la raccolta. Con ``store=None`` (dry run) non scrive nulla."""
    summary = RunSummary()
    for code in competitions:
        before = client.requests_used
        run_id: int | None = None
        try:
            if store is not None:
                run_id = store.start_run(PROVIDER, JOB_TYPE, f"{code}:current", triggered_by)
            batch, issues = collect_competition(client, code)
            result = CompetitionResult(code=code, status="SUCCEEDED", issues=len(issues))
            if batch is not None:
                result.matches = len(batch["matches"])
                result.teams = len(batch["teams"])
                result.standings = len(batch["standings"])
            errors = sum(1 for i in issues if i["severity"] == "ERROR")
            if batch is None:
                result.status = "FAILED"
                result.error = "Risposta del provider incompleta"
            elif errors:
                result.status = "PARTIAL"
            if store is not None and run_id is not None:
                rows = 0
                if batch is not None:
                    written = store.ingest(run_id, batch)
                    rows = int(written.get("matches", 0)) + int(written.get("teams", 0))
                store.report_issues(run_id, issues)
                store.resolve_issues(run_id, MATCH_CHECKS, resolvable_matches(batch, issues))
                store.finish_run(
                    run_id,
                    result.status,
                    requests_used=client.requests_used - before,
                    rows_upserted=rows,
                    error_count=errors,
                    error_summary=result.error,
                )
        except Exception as exc:
            message = sanitize(f"{type(exc).__name__}: {exc}", secrets)
            result = CompetitionResult(code=code, status="FAILED", error=message)
            if store is not None and run_id is not None:
                # Se anche la chiusura fallisce, l'esecuzione viene chiusa dopo 1 ora.
                with contextlib.suppress(Exception):
                    store.finish_run(
                        run_id,
                        "FAILED",
                        requests_used=client.requests_used - before,
                        rows_upserted=0,
                        error_count=1,
                        error_summary=message,
                    )
        summary.results.append(result)
    return summary
