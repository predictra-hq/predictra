"""Backtest walk-forward sull'1X2 (ADR 0020 §4).

Il periodo si divide in finestre settimanali. Per ogni finestra il modello si
adatta solo sulle partite con kickoff precedente all'inizio della finestra e
prevede le partite della finestra. Le prime ``warmup_days`` servono solo per
l'addestramento.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

import numpy as np

from .data import Fixture, MatchResult
from .metrics import brier, calibration, log_loss
from .models.base import Model


@dataclass
class BacktestResult:
    model_key: str
    window_start: datetime
    window_end: datetime
    matches: int
    brier: float
    log_loss: float
    ece: float
    calibration: list[dict[str, Any]] = field(default_factory=list)
    probs: np.ndarray | None = None
    outcomes: np.ndarray | None = None


def walk_forward_predictions(
    model: Model,
    results: list[MatchResult],
    *,
    warmup_days: int = 28,
    step_days: int = 7,
    start: datetime | None = None,
) -> tuple[list[MatchResult], np.ndarray]:
    """Previsioni settimana per settimana; con ``start`` si valutano solo le partite da lì."""
    ordered = sorted(results, key=lambda r: (r.kickoff_at, r.match_id))
    if not ordered:
        return [], np.zeros((0, 3))
    cursor = ordered[0].kickoff_at + timedelta(days=warmup_days)
    if start is not None:
        cursor = max(cursor, start)
    last = ordered[-1].kickoff_at
    evaluated: list[MatchResult] = []
    rows: list[np.ndarray] = []
    while cursor <= last:
        window_end = cursor + timedelta(days=step_days)
        targets = [r for r in ordered if cursor <= r.kickoff_at < window_end]
        if targets:
            fitted = model.fit(ordered, cursor)  # fit usa solo kickoff < cursor
            for r in targets:
                fx = Fixture(r.match_id, r.competition_id, r.kickoff_at, r.home, r.away)
                if fitted.covers(fx):
                    evaluated.append(r)
                    rows.append(fitted.probabilities_1x2(fx))
        cursor = window_end
    return evaluated, np.array(rows).reshape(-1, 3)


def evaluate(
    model_key: str, evaluated: list[MatchResult], probs: np.ndarray
) -> BacktestResult | None:
    if not evaluated:
        return None
    outcomes = np.array([r.outcome for r in evaluated])
    ece, curve = calibration(probs, outcomes)
    return BacktestResult(
        model_key=model_key,
        window_start=evaluated[0].kickoff_at,
        window_end=evaluated[-1].kickoff_at,
        matches=len(evaluated),
        brier=brier(probs, outcomes),
        log_loss=log_loss(probs, outcomes),
        ece=ece,
        calibration=curve,
        probs=probs,
        outcomes=outcomes,
    )


def backtest_models(
    models: list[Model], results: list[MatchResult], **kwargs: Any
) -> dict[str, BacktestResult]:
    """Backtest di tutti i modelli sulle stesse partite (quelle coperte da tutti)."""
    raw = {m.key: walk_forward_predictions(m, results, **kwargs) for m in models}
    common = (
        set.intersection(*({r.match_id for r in ev} for ev, _ in raw.values())) if raw else set()
    )
    out: dict[str, BacktestResult] = {}
    for key, (evaluated, probs) in raw.items():
        keep = [i for i, r in enumerate(evaluated) if r.match_id in common]
        res = evaluate(key, [evaluated[i] for i in keep], probs[keep] if keep else probs[:0])
        if res is not None:
            out[key] = res
    return out
