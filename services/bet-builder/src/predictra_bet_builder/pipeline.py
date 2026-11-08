"""Esecuzione del Bet Builder (fase A4): legge previsioni e quote, salva le proposte.

1. modello attivo; se non c'è, nessuna run (il database la rifiuterebbe);
2. partite SCHEDULED dell'orizzonte, previsioni 1X2 più recenti del modello attivo,
   ultime quote h2h FRESH e di qualità OK: per ogni previsione la quota migliore;
3. combinazioni, soglie, categorie e ranking (``builder``);
4. ``start_bet_builder_run`` → ``record_bet_proposals`` → ``finish_bet_builder_run``.
   Zero proposte valide = run riuscita con zero proposte.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Protocol

from .builder import Leg, Proposal, build_proposals
from .rules import Rules

# Margini rispetto ai controlli del database, che rifiuta l'intero lotto se una
# selezione non è più valida al momento della scrittura.
FRESHNESS_MARGIN = timedelta(minutes=30)
KICKOFF_MARGIN = timedelta(minutes=15)
BATCH = 50

_INTERVAL = re.compile(r"^(?:(\d+) days? ?)?(?:(\d+):(\d{2}):(\d{2})(?:\.\d+)?)?$")


class Store(Protocol):
    def active_model_version(self) -> int | None: ...
    def upcoming_fixtures(self, start: datetime, end: datetime) -> list[dict[str, Any]]: ...
    def predictions(self, model_version_id: int, match_ids: Any) -> list[dict[str, Any]]: ...
    def odds_events(self, match_ids: Any) -> list[dict[str, Any]]: ...
    def h2h_snapshots(self, event_ids: Any) -> list[dict[str, Any]]: ...
    def odds_max_age(self) -> dict[str, str]: ...
    def start_run(
        self, model_version_id: int, code_commit: str, rules: dict[str, object], triggered_by: str
    ) -> int: ...
    def record_proposals(
        self, run_id: int, proposals: list[dict[str, object]]
    ) -> dict[str, int]: ...
    def finish_run(self, run_id: int, status: str, candidates: int, error: str | None) -> None: ...


def parse_interval(value: str) -> timedelta:
    """Intervallo di Postgres nel formato predefinito (es. ``12:00:00``, ``1 day 02:00:00``)."""
    m = _INTERVAL.match(value.strip())
    if not m or not any(m.groups()):
        raise ValueError(f"Intervallo non riconosciuto: {value!r}")
    days, hours, minutes, seconds = (int(x) if x else 0 for x in m.groups())
    return timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass
class Summary:
    model_version_id: int | None = None
    fixtures: int = 0
    legs: int = 0
    candidates: int = 0
    proposals: list[Proposal] = field(default_factory=list)
    run_id: int | None = None
    written: int = 0
    skipped_reason: str | None = None


def collect_legs(
    store: Store, model_version_id: int, now: datetime, horizon: timedelta
) -> tuple[list[Leg], int]:
    fixtures = store.upcoming_fixtures(now + KICKOFF_MARGIN, now + horizon)
    by_match = {int(f["match_id"]): f for f in fixtures}
    if not by_match:
        return [], 0

    latest_pred: dict[tuple[int, str], dict[str, Any]] = {}
    for p in store.predictions(model_version_id, by_match):
        key = (int(p["match_id"]), p["selection"])
        cur = latest_pred.get(key)
        if cur is None or (_ts(p["as_of"]), int(p["id"])) > (_ts(cur["as_of"]), int(cur["id"])):
            latest_pred[key] = p

    events = {int(e["id"]): int(e["match_id"]) for e in store.odds_events(by_match)}
    max_age = {k: parse_interval(v) for k, v in store.odds_max_age().items()}
    latest_odds: dict[tuple[int, str, str], dict[str, Any]] = {}
    for s in store.h2h_snapshots(events):
        key = (int(s["event_id"]), s["bookmaker"], s["selection"])
        cur = latest_odds.get(key)
        rank = (_ts(s["event_time"]), _ts(s["observed_at"]))
        if cur is None or rank > (_ts(cur["event_time"]), _ts(cur["observed_at"])):
            latest_odds[key] = s

    best: dict[tuple[int, str], dict[str, Any]] = {}
    for (event_id, _bookmaker, selection), s in latest_odds.items():
        if s["quality"] != "OK":
            continue
        age = max_age.get(s["provider"])
        if age is not None and _ts(s["observed_at"]) < now - age + FRESHNESS_MARGIN:
            continue
        key = (events[event_id], selection)
        cur = best.get(key)
        if cur is None or (Decimal(str(s["price"])), cur["bookmaker"]) > (
            Decimal(str(cur["price"])),
            s["bookmaker"],
        ):
            best[key] = s

    legs: list[Leg] = []
    for (match_id, selection), p in sorted(latest_pred.items()):
        odds = best.get((match_id, selection))
        if odds is None or (p["push_probability"] or 0) > 0 or p["line"] is not None:
            continue
        f = by_match[match_id]
        legs.append(
            Leg(
                prediction_id=int(p["id"]),
                match_id=match_id,
                kickoff_at=_ts(f["kickoff_at"]),
                home_team_id=int(f["home_team_id"]),
                away_team_id=int(f["away_team_id"]),
                market=p["market"],
                line=None,
                selection=selection,
                probability=Decimal(str(p["probability"])),
                confidence=Decimal(str(p["confidence_score"])),
                odds_snapshot_id=int(odds["id"]),
                bookmaker=odds["bookmaker"],
                price=Decimal(str(odds["price"])),
            )
        )
    return legs, len(by_match)


def run(
    store: Store,
    rules: Rules,
    *,
    now: datetime,
    code_commit: str,
    horizon_days: int = 7,
    triggered_by: str = "manual",
    dry_run: bool = False,
) -> Summary:
    summary = Summary()
    model = store.active_model_version()
    summary.model_version_id = model
    if model is None:
        summary.skipped_reason = "nessun modello attivo"
        return summary

    legs, summary.fixtures = collect_legs(store, model, now, timedelta(days=horizon_days))
    summary.legs = len(legs)
    summary.proposals, summary.candidates = build_proposals(legs, rules)
    if dry_run:
        return summary

    run_id = store.start_run(model, code_commit, rules.as_json(), triggered_by)
    summary.run_id = run_id
    try:
        items = [p.as_batch_item(rules) for p in summary.proposals]
        for i in range(0, len(items), BATCH):
            summary.written += int(
                store.record_proposals(run_id, items[i : i + BATCH])["proposals"]
            )
    except Exception as exc:
        store.finish_run(
            run_id, "FAILED", summary.candidates, f"{type(exc).__name__}: {exc}"[:2000]
        )
        raise
    store.finish_run(run_id, "SUCCEEDED", summary.candidates, None)
    return summary
