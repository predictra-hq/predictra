"""Modello combinato: un modello gol con l'Elo sull'1X2 (ADR 0039).

L'1X2 è la media pesata ``(1 − w)·gol + w·Elo``: i due modelli sbagliano in modo diverso
(il modello gol legge i gol fatti e subiti, l'Elo solo i risultati con il loro ordine nel
tempo) e la media è più precisa di ciascuno nel backtest.

Gli altri mercati vengono dalla matrice dei risultati esatti del modello gol, ricalibrata
in modo che la somma delle celle di vittoria casa, pareggio e vittoria ospite sia uguale
all'1X2 combinato. Dentro ogni zona le proporzioni tra i punteggi restano quelle del
modello gol: così tutti i mercati derivati sono coerenti con l'1X2 mostrato.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np

from ..data import MatchResult
from .base import CompetitionFit, Model
from .elo import Elo, EloFit
from .goals import DEFAULT_L2, NEWCOMER_ATTACK, NEWCOMER_DEFENCE, GoalsFit, GoalsModel


def rescale_to_1x2(matrix: np.ndarray, target: np.ndarray) -> np.ndarray:
    """Matrice con zone casa/pareggio/ospite riportate alle probabilità ``target``."""
    m = matrix.astype(float).copy()
    zones = (
        np.tril(np.ones_like(m, dtype=bool), -1),  # gol casa > gol ospite
        np.eye(m.shape[0], m.shape[1], dtype=bool),
        np.triu(np.ones_like(m, dtype=bool), 1),
    )
    for zone, t in zip(zones, target, strict=True):
        current = m[zone].sum()
        if current > 0:
            m[zone] *= t / current
    return m / m.sum()


@dataclass
class EloBlendFit(CompetitionFit):
    goals: GoalsFit
    elo: EloFit
    weight: float

    def probabilities_1x2(self, home: int, away: int) -> np.ndarray:
        g = self.goals.probabilities_1x2(home, away)
        e = self.elo.probabilities_1x2(home, away)
        p = (1 - self.weight) * g + self.weight * e
        return p / p.sum()

    def score_matrix(self, home: int, away: int) -> np.ndarray:
        return rescale_to_1x2(
            self.goals.score_matrix(home, away), self.probabilities_1x2(home, away)
        )

    def lambdas(self, home: int, away: int) -> tuple[float, float, float | None]:
        return self.goals.lambdas(home, away)

    def parameters(self) -> dict[str, Any]:
        return {
            "goals": self.goals.parameters(),
            "elo": self.elo.parameters(),
            "elo_weight": self.weight,
        }


class EloBlendModel(Model):
    def __init__(self, key: str, goals: GoalsModel, elo: Elo, weight: float) -> None:
        if not 0 <= weight <= 1:
            raise ValueError("Peso dell'Elo tra 0 e 1")
        self.key = key
        self.goals = goals
        self.elo = elo
        self.weight = weight

    def hyperparameters(self) -> dict[str, Any]:
        return {
            **self.goals.hyperparameters(),
            "elo": self.elo.hyperparameters(),
            "elo_weight": self.weight,
        }

    def fit_competition(self, results: list[MatchResult], as_of: datetime) -> EloBlendFit:
        return EloBlendFit(
            self.goals.fit_competition(results, as_of),
            self.elo.fit_competition(results, as_of),
            self.weight,
        )


# Peso scelto sul banco di prova del 14/11/2026 (ADR 0039).
ELO_WEIGHT = 0.4


def dixon_coles_model() -> EloBlendModel:
    """Sfidante del modello PREDICTRA (ADR 0024): Dixon-Coles combinato con l'Elo.

    ξ = 0,001 al giorno (emivita circa 23 mesi) e neopromosse più deboli (ADR 0038).
    """
    goals = GoalsModel(
        "dixon_coles",
        dixon_coles=True,
        xi=0.001,
        l2=DEFAULT_L2,
        newcomer_attack=NEWCOMER_ATTACK,
        newcomer_defence=NEWCOMER_DEFENCE,
    )
    return EloBlendModel("dixon_coles", goals, Elo(), ELO_WEIGHT)
