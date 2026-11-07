"""Raccolta quote 1X2 da The Odds API (ADR 0015): una esecuzione per competizione.

Modalità:
- ``daily``: snapshot di tutte le competizioni (1 credito ciascuna se ci sono eventi).
- ``prematch``: solo le competizioni con almeno una partita nelle prossime 6 ore,
  verificate prima con ``/events`` (gratuito).
"""

from __future__ import annotations

import contextlib
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Protocol

from .config import ODDS_SPORT_KEYS
from .runner import sanitize
from .the_odds_api import PROVIDER, BudgetExhausted, OddsApiClient, normalize_odds

JOB_TYPE = "odds.h2h"
PREMATCH_WINDOW = timedelta(hours=6)
Mode = Literal["daily", "prematch"]


class OddsStore(Protocol):
    def start_run(
        self, provider: str, job_type: str, window_key: str, triggered_by: str
    ) -> int: ...
    def ingest_odds(self, run_id: int, batch: dict[str, Any]) -> dict[str, Any]: ...
    def report_issues(self, run_id: int, issues: list[dict[str, Any]]) -> None: ...
    def finish_run(
        self,
        run_id: int,
        status: str,
        *,
        requests_used: int,
        rows_upserted: int,
        error_count: int,
        error_summary: str | None,
        quota_remaining: int | None = None,
    ) -> None: ...


@dataclass
class OddsResult:
    code: str
    status: str
    events: int = 0
    bookmakers: int = 0
    matched: int | None = None
    credits: int = 0
    unknown_outcomes: list[str] = field(default_factory=list)
    error: str | None = None


@dataclass
class OddsSummary:
    results: list[OddsResult] = field(default_factory=list)
    remaining: int | None = None

    @property
    def failed(self) -> bool:
        return any(r.status == "FAILED" for r in self.results)


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def has_upcoming(events: list[dict[str, Any]], now: datetime, window: timedelta) -> bool:
    for ev in events:
        try:
            start = _parse(str(ev.get("commence_time")))
        except ValueError:
            continue
        if now <= start <= now + window:
            return True
    return False


def run_odds(
    client: OddsApiClient,
    store: OddsStore | None,
    competitions: tuple[str, ...],
    *,
    mode: Mode = "daily",
    triggered_by: str = "schedule",
    secrets: tuple[str, ...] = (),
    now: datetime | None = None,
) -> OddsSummary:
    summary = OddsSummary()
    current = now or datetime.now(UTC)
    observed = current.isoformat(timespec="seconds")

    for code in competitions:
        sport_key = ODDS_SPORT_KEYS[code]
        if mode == "prematch":
            try:
                upcoming = has_upcoming(client.events(sport_key), current, PREMATCH_WINDOW)
            except Exception as exc:
                summary.results.append(
                    OddsResult(
                        code, "FAILED", error=sanitize(f"{type(exc).__name__}: {exc}", secrets)
                    )
                )
                continue
            if not upcoming:
                summary.results.append(OddsResult(code, "SKIPPED"))
                continue

        before = client.credits_used
        run_id: int | None = None
        try:
            if store is not None:
                run_id = store.start_run(PROVIDER, JOB_TYPE, f"{code}:{mode}", triggered_by)
            events = client.odds(sport_key)
            normalized = normalize_odds(events, code, sport_key, observed)
            teams = {e.get("home_team") for e in events} | {e.get("away_team") for e in events}
            result = OddsResult(
                code,
                "SUCCEEDED",
                events=len(normalized.batch["events"]),
                bookmakers=len(
                    {b["key"] for e in normalized.batch["events"] for b in e["bookmakers"]}
                ),
                credits=client.credits_used - before,
                unknown_outcomes=sorted(n for n in normalized.outcome_names if n not in teams),
            )
            if store is not None and run_id is not None:
                written = store.ingest_odds(run_id, normalized.batch)
                result.matched = int(written.get("matched", 0))
                store.report_issues(run_id, normalized.issues)
                store.finish_run(
                    run_id,
                    "SUCCEEDED",
                    requests_used=result.credits,
                    rows_upserted=int(written.get("snapshots_inserted", 0)),
                    error_count=0,
                    error_summary=None,
                    quota_remaining=client.remaining,
                )
        except BudgetExhausted as exc:
            message = sanitize(str(exc), secrets)
            result = OddsResult(code, "FAILED", error=message)
            if store is not None and run_id is not None:
                with contextlib.suppress(Exception):
                    store.finish_run(
                        run_id,
                        "FAILED",
                        requests_used=0,
                        rows_upserted=0,
                        error_count=1,
                        error_summary=message,
                        quota_remaining=client.remaining,
                    )
            summary.results.append(result)
            break  # crediti finiti: inutile proseguire con le altre competizioni
        except Exception as exc:
            message = sanitize(f"{type(exc).__name__}: {exc}", secrets)
            result = OddsResult(code, "FAILED", credits=client.credits_used - before, error=message)
            if store is not None and run_id is not None:
                with contextlib.suppress(Exception):
                    store.finish_run(
                        run_id,
                        "FAILED",
                        requests_used=client.credits_used - before,
                        rows_upserted=0,
                        error_count=1,
                        error_summary=message,
                        quota_remaining=client.remaining,
                    )
        summary.results.append(result)

    summary.remaining = client.remaining
    return summary
