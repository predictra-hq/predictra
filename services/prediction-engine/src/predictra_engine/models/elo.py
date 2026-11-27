"""Elo con vantaggio casalingo; 1X2 da un modello logistico ordinale (ADR 0021).

Le valutazioni si aggiornano in ordine cronologico. Il modello ordinale
P(ospite) = σ(c1 − β·d), P(ospite o pareggio) = σ(c2 − β·d), con d = differenza
Elo prima della partita (casa + vantaggio − ospite), si stima per massima
verosimiglianza sulle partite di addestramento.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit

from ..data import MatchResult
from .base import CompetitionFit, Model

INITIAL_RATING = 1500.0


def ordinal_probabilities(d: np.ndarray | float, c1: float, c2: float, beta: float) -> np.ndarray:
    d = np.asarray(d, dtype=float)
    p_away = expit(c1 - beta * d)
    p_away_or_draw = expit(c2 - beta * d)
    probs = np.stack([1 - p_away_or_draw, p_away_or_draw - p_away, p_away], axis=-1)
    return np.clip(probs, 1e-9, 1)


@dataclass
class EloFit(CompetitionFit):
    ratings: dict[int, float]
    home_advantage: float
    c1: float
    c2: float
    beta: float
    matches: int = 0

    def diff(self, home: int, away: int) -> float:
        return (
            self.ratings.get(home, INITIAL_RATING)
            + self.home_advantage
            - self.ratings.get(away, INITIAL_RATING)
        )

    def probabilities_1x2(self, home: int, away: int) -> np.ndarray:
        p = ordinal_probabilities(self.diff(home, away), self.c1, self.c2, self.beta)
        return p / p.sum()

    def parameters(self) -> dict[str, Any]:
        return {
            "ratings": {str(k): round(v, 3) for k, v in sorted(self.ratings.items())},
            "c1": round(self.c1, 6),
            "c2": round(self.c2, 6),
            "beta": round(self.beta, 8),
            "matches": self.matches,
        }


class Elo(Model):
    key = "elo"

    def __init__(
        self, k: float = 20.0, home_advantage: float = 60.0, scope: str = "competition"
    ) -> None:
        if scope not in ("competition", "all"):
            raise ValueError("scope: 'competition' o 'all'")
        self.k = k
        self.home_advantage = home_advantage
        # ADR 0079: "all" = una valutazione per squadra su tutte le competizioni (Elo unico).
        # Lo applica EloBlendModel; da solo l'Elo resta per competizione.
        self.scope = scope

    def hyperparameters(self) -> dict[str, Any]:
        hp: dict[str, Any] = {"k": self.k, "home_advantage": self.home_advantage}
        # Solo quando cambia: le versioni già salvate restano con gli stessi iperparametri.
        if self.scope != "competition":
            hp["scope"] = self.scope
        return hp

    def fit_competition(self, results: list[MatchResult], as_of: datetime) -> EloFit:
        ratings: dict[int, float] = {}
        diffs, outcomes = [], []
        for r in results:
            rh = ratings.get(r.home, INITIAL_RATING)
            ra = ratings.get(r.away, INITIAL_RATING)
            d = rh + self.home_advantage - ra
            diffs.append(d)
            outcomes.append(r.outcome)
            expected = 1 / (1 + 10 ** (-d / 400))
            score = 1.0 if r.outcome == 0 else 0.5 if r.outcome == 1 else 0.0
            ratings[r.home] = rh + self.k * (score - expected)
            ratings[r.away] = ra - self.k * (score - expected)

        # Valori iniziali ragionevoli (≈ 45/27/28 a parità di forza); con pochi dati restano vicini.
        start = np.array([-0.95, 0.15, 0.004])
        if len(results) >= 10:
            d_arr, y = np.array(diffs), np.array(outcomes)

            def nll(theta: np.ndarray) -> float:
                c1, gap, beta = theta
                probs = ordinal_probabilities(d_arr, c1, c1 + abs(gap) + 1e-6, beta)
                penalty = 0.5 * ((theta - start) ** 2).sum()  # regolarizzazione leggera
                return float(-np.log(probs[np.arange(len(y)), y]).sum() + penalty)

            res = minimize(nll, start, method="L-BFGS-B")
            c1, gap, beta = res.x
        else:
            c1, gap, beta = start
        return EloFit(
            ratings,
            self.home_advantage,
            float(c1),
            float(c1 + abs(gap) + 1e-6),
            float(beta),
            len(results),
        )
