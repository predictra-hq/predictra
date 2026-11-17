"""Prova in sola lettura: taratura dei gol totali (linee 2,5 e 3,5) sui dati reali.

La verifica storica (ADR 0057) mostra che le giocate dal 70% su più/meno 2,5 e 3,5 escono
meno di quanto dato. Qui si rigiocano tutte le partite (walk-forward), si raccolgono le
probabilità dell'over della matrice e si stima una taratura σ(a·logit p + b) su una parte
delle stagioni, verificandola sulle altre (nei due versi). Si adotta solo se il Log Loss
migliora in entrambi i versi. Non scrive nulla.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

import numpy as np
from scipy.optimize import minimize

from .backtest import backtest_models
from .data import MatchResult
from .markets import _over_under
from .models.base import Model

LINES = (1.5, 2.5, 3.5)


def _logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return np.log(p / (1 - p))


def _apply(p: np.ndarray, a: float, b: float) -> np.ndarray:
    return 1 / (1 + np.exp(-(a * _logit(p) + b)))


def _log_loss(p: np.ndarray, y: np.ndarray) -> float:
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def fit(p: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    res = minimize(
        lambda x: _log_loss(_apply(p, x[0], x[1]), y), x0=[1.0, 0.0], method="Nelder-Mead"
    )
    return float(res.x[0]), float(res.x[1])


def _tail(p: np.ndarray, y: np.ndarray, threshold: float = 0.7) -> str:
    """Giocate dal 70% (over o under, il più probabile): uscite contro date."""
    best = np.maximum(p, 1 - p)
    won = np.where(p >= 0.5, y, 1 - y)
    mask = best >= threshold
    if not mask.any():
        return "nessuna giocata dal 70%"
    return (
        f"giocate dal 70%: {int(won[mask].sum())}/{int(mask.sum())} "
        f"({won[mask].mean():.1%}) date al {best[mask].mean():.1%}"
    )


def _season(r: MatchResult) -> int:
    return r.kickoff_at.year if r.kickoff_at.month >= 7 else r.kickoff_at.year - 1


def run_totals(model: Model, results: list[MatchResult], as_of: datetime) -> list[str]:
    data: dict[float, list[tuple[int, float, int]]] = defaultdict(list)

    def observe(r: MatchResult, matrix: Any, p1x2: Any) -> None:
        if matrix is None:
            return
        hg, ag = np.indices(matrix.shape)
        dist = np.bincount((hg + ag).ravel(), weights=matrix.ravel())
        goals = r.home_goals + r.away_goals
        for line in LINES:
            over, _, _ = _over_under(dist, line)
            data[line].append((_season(r), over, int(goals > line)))

    backtest_models([model], results, observers={model.key: observe})
    out = [f"Taratura gol totali — {len(results)} partite fino al {as_of.date()} (sola lettura)"]
    for line in LINES:
        rows = data[line]
        seasons = np.array([s for s, _, _ in rows])
        p = np.array([x for _, x, _ in rows])
        y = np.array([o for _, _, o in rows], dtype=float)
        cut = int(np.median(seasons))
        old, new = seasons <= cut, seasons > cut
        out.append(f"  linea {line}: {len(rows)} partite · matrice: {_tail(p, y)}")
        verdicts = []
        for name, train, test in (("vecchie→recenti", old, new), ("recenti→vecchie", new, old)):
            if train.sum() < 200 or test.sum() < 200:
                continue
            a, b = fit(p[train], y[train])
            raw = _log_loss(p[test], y[test])
            cal = _log_loss(_apply(p[test], a, b), y[test])
            verdicts.append(cal < raw)
            out.append(
                f"    {name}: a={a:.2f} b={b:.2f} LogLoss {raw:.4f} → {cal:.4f} · "
                f"tarata {_tail(_apply(p[test], a, b), y[test])}"
            )
        a, b = fit(p, y)
        verdict = (
            "ADOTTABILE (migliora nei due versi)"
            if verdicts and all(verdicts)
            else "da non adottare"
        )
        out.append(f"    tutte: a={a:.2f} b={b:.2f} · {verdict}")
    return out
