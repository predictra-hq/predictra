"""Raccolta quote da The Odds API (ADR 0015, 0029): una esecuzione per competizione.

Modalità:
- ``daily``: snapshot di tutte le competizioni: 1X2, e under/over se i crediti bastano
  fino a fine mese (1 credito per mercato, se ci sono eventi).
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
from .the_odds_api import (
    CREDIT_RESERVE,
    DOUBLE_CHANCE,
    MARKET,
    PROVIDER,
    TOTALS,
    BudgetExhausted,
    OddsApiClient,
    normalize_odds,
)

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
    extra_failed: int = 0


@dataclass
class OddsSummary:
    results: list[OddsResult] = field(default_factory=list)
    markets: tuple[str, ...] = ()
    plan: DailyPlan | None = None
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


DUE_WINDOW = timedelta(hours=48)  # daily: solo competizioni con partite entro 48 ore
DOUBLE_CHANCE_WINDOW = timedelta(hours=36)  # doppia chance: partite più vicine


def days_left_in_month(now: datetime) -> int:
    """Giorni da oggi (compreso) alla fine del mese."""
    next_month = (now.replace(day=28) + timedelta(days=4)).replace(day=1)
    return (next_month.date() - now.date()).days


def daily_allowance(remaining: int | None, now: datetime) -> int | None:
    """Crediti spendibili oggi: (residui - riserva) / giorni rimanenti (ADR 0032)."""
    if remaining is None:
        return None
    return max(0, (remaining - CREDIT_RESERVE) // days_left_in_month(now))


@dataclass
class DailyPlan:
    """Cosa chiedere oggi, in ordine di priorità: 1X2, under/over, doppia chance."""

    allowance: int | None
    due: tuple[str, ...]
    markets: tuple[str, ...]
    double_chance: dict[str, list[str]]

    @property
    def planned_credits(self) -> int:
        return len(self.due) * len(self.markets) + sum(len(v) for v in self.double_chance.values())


def plan_daily(
    events_by_code: dict[str, list[dict[str, Any]]], remaining: int | None, now: datetime
) -> DailyPlan:
    """Piano dei crediti del giorno (ADR 0032), calcolato con chiamate gratuite.

    - Competizioni senza partite nelle prossime 48 ore: nessun credito.
    - 1X2 sempre (1 credito per competizione con partite).
    - Under/over nella stessa chiamata se il budget del giorno basta per tutte.
    - Con il resto, doppia chance per le partite delle prossime 36 ore, dalla più vicina.
    Senza il dato dei crediti residui: solo 1X2.
    """
    allowance = daily_allowance(remaining, now)
    due = tuple(c for c, evs in events_by_code.items() if has_upcoming(evs, now, DUE_WINDOW))
    if allowance is None:
        return DailyPlan(None, due, (MARKET,), {})
    markets: tuple[str, ...] = (MARKET, TOTALS) if allowance >= 2 * len(due) else (MARKET,)
    left = allowance - len(due) * len(markets)
    candidates: list[tuple[str, str, str]] = []
    for code in due:
        for ev in events_by_code[code]:
            try:
                start = _parse(str(ev.get("commence_time")))
            except ValueError:
                continue
            if ev.get("id") and now <= start <= now + DOUBLE_CHANCE_WINDOW:
                candidates.append((start.isoformat(), code, str(ev["id"])))
    double_chance: dict[str, list[str]] = {}
    for _, code, event_id in sorted(candidates)[: max(0, left)]:
        double_chance.setdefault(code, []).append(event_id)
    return DailyPlan(allowance, due, markets, double_chance)


def _merge_event_markets(events: list[dict[str, Any]], extra: dict[str, Any]) -> None:
    """Aggiunge ai bookmaker dell'evento i mercati di /events/{id}/odds."""
    target = next((e for e in events if e.get("id") == extra.get("id")), None)
    if target is None:
        if extra.get("id"):
            events.append(extra)
        return
    books = {b.get("key"): b for b in target.setdefault("bookmakers", [])}
    for book in extra.get("bookmakers") or []:
        existing = books.get(book.get("key"))
        if existing is None:
            target["bookmakers"].append(book)
        else:
            existing.setdefault("markets", []).extend(book.get("markets") or [])


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
    markets: tuple[str, ...] = (MARKET,)
    plan: DailyPlan | None = None
    if mode == "daily":
        # Chiamate gratuite: crediti residui (/sports) e calendario (/events).
        with contextlib.suppress(Exception):
            client.sports()
        events_by_code: dict[str, list[dict[str, Any]]] = {}
        for code in competitions:
            try:
                events_by_code[code] = client.events(ODDS_SPORT_KEYS[code])
            except Exception as exc:
                summary.results.append(
                    OddsResult(
                        code, "FAILED", error=sanitize(f"{type(exc).__name__}: {exc}", secrets)
                    )
                )
        plan = plan_daily(events_by_code, client.remaining, current)
        markets = plan.markets
        summary.plan = plan
        competitions = tuple(c for c in competitions if c in events_by_code)
    summary.markets = markets

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

        if plan is not None and code not in plan.due:
            summary.results.append(OddsResult(code, "SKIPPED"))
            continue

        before = client.credits_used
        run_id: int | None = None
        try:
            if store is not None:
                run_id = store.start_run(PROVIDER, JOB_TYPE, f"{code}:{mode}", triggered_by)
            events = client.odds(sport_key, markets)
            extra_failed = 0
            for event_id in plan.double_chance.get(code, []) if plan else []:
                # Una partita senza risposta non ferma la competizione; crediti finiti sì.
                try:
                    extra = client.event_odds(sport_key, event_id, (DOUBLE_CHANCE,))
                except BudgetExhausted:
                    raise
                except Exception:
                    extra_failed += 1
                    continue
                _merge_event_markets(events, extra)
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
                extra_failed=extra_failed,
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
