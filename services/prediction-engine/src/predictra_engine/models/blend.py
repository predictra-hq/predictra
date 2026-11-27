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
from .base import CompetitionFit, FittedModel, Model
from .elo import Elo, EloFit
from .goals import DEFAULT_L2, NEWCOMER_ATTACK, NEWCOMER_DEFENCE, GoalsFit, GoalsModel
from .joint import JointFit, fit_joint
from .ratings import GlobalElo


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
    # λ e ρ sono del Dixon-Coles interno; la matrice salvata è la sua, riportata all'1X2
    # combinato salvato con la previsione (rescale_to_1x2).
    matrix_from = "dixon_coles_rescaled_to_1x2"

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

    def fit(self, results: list[MatchResult], as_of: datetime) -> FittedModel:
        fitted = super().fit(results, as_of)
        # ADR 0079: con l'Elo unico ogni competizione usa le valutazioni comuni a tutte.
        if self.elo.scope == "all":
            glob = GlobalElo(self.elo.k, self.elo.home_advantage).fit(results, as_of)
            for comp, fit in fitted.fits.items():
                if comp in glob.fits and isinstance(fit, EloBlendFit):
                    fit.elo = glob.fits[comp]  # type: ignore[assignment]
        return fitted


# Peso scelto sul banco di prova del 14/11/2026 (ADR 0039).
ELO_WEIGHT = 0.4


@dataclass
class JointBlendFit(CompetitionFit):
    """1X2 = media tra il modello della competizione e il modello unico (ADR 0074)."""

    inner: EloBlendFit
    joint: JointFit
    competition_id: int
    weight: float
    # λ e ρ sono del Dixon-Coles interno; la matrice salvata è la sua, riportata all'1X2
    # combinato salvato con la previsione (rescale_to_1x2).
    matrix_from = "dixon_coles_rescaled_to_1x2"

    def _joint_1x2(self, home: int, away: int) -> np.ndarray | None:
        if self.competition_id not in self.joint.comps:
            return None
        return self.joint.probabilities_for(self.competition_id, home, away)

    def probabilities_1x2(self, home: int, away: int) -> np.ndarray:
        p = self.inner.probabilities_1x2(home, away)
        j = self._joint_1x2(home, away)
        if j is None:
            return p
        q = (1 - self.weight) * p + self.weight * j
        return q / q.sum()

    def score_matrix(self, home: int, away: int) -> np.ndarray:
        return rescale_to_1x2(
            self.inner.goals.score_matrix(home, away), self.probabilities_1x2(home, away)
        )

    def lambdas(self, home: int, away: int) -> tuple[float, float, float | None]:
        return self.inner.lambdas(home, away)

    def parameters(self) -> dict[str, Any]:
        # Del modello unico si salvano solo i valori della competizione e delle sue squadre.
        return {
            **self.inner.parameters(),
            "joint": self.joint.parameters_for(self.competition_id, self.inner.goals.teams),
            "joint_weight": self.weight,
        }


class JointEloBlendModel(EloBlendModel):
    """Modello PREDICTRA dal 25/11/2026 (ADR 0074): Dixon-Coles + Elo per competizione,
    mediato sull'1X2 con il modello gol unico su tutte le competizioni."""

    def __init__(
        self,
        key: str,
        goals: GoalsModel,
        elo: Elo,
        weight: float,
        *,
        joint_weight: float,
        joint_xi: float,
        joint_l2: float,
    ) -> None:
        super().__init__(key, goals, elo, weight)
        if not 0 <= joint_weight <= 1:
            raise ValueError("Peso del modello unico tra 0 e 1")
        self.joint_weight = joint_weight
        self.joint_xi = joint_xi
        self.joint_l2 = joint_l2

    def hyperparameters(self) -> dict[str, Any]:
        return {
            **super().hyperparameters(),
            "joint": {
                "weight": self.joint_weight,
                "xi_per_day": self.joint_xi,
                "l2": self.joint_l2,
            },
        }

    def fit(self, results: list[MatchResult], as_of: datetime) -> FittedModel:
        fitted = super().fit(results, as_of)
        joint = fit_joint(results, as_of, self.joint_xi, self.joint_l2)
        fitted.fits = {
            comp: JointBlendFit(fit, joint, comp, self.joint_weight)  # type: ignore[arg-type]
            for comp, fit in fitted.fits.items()
        }
        return fitted


# ADR 0074 (prova `cross`, 3.499 partite dal 1/7/2024 mai viste dal modello): con peso 0,3
# Log Loss 1X2 −0,0017 ± 0,0012 in tutto, −0,0023 sul 2024-25, +0,0001 ± 0,0026 sul 2025-26
# (nessun peggioramento), −0,010 in Champions League. Con 0,5 il guadagno è nel rumore e il
# 2025-26 peggiora un poco. ξ e L2 come Poisson per competizione.
JOINT_WEIGHT = 0.3
JOINT_XI = 0.0015


def dixon_coles_model() -> EloBlendModel:
    """Modello PREDICTRA (ADR 0024, 0039, 0074, 0079): Dixon-Coles combinato con l'Elo e,
    sull'1X2, con il modello gol unico su tutte le competizioni.

    ξ = 0,001 al giorno (emivita circa 23 mesi) e neopromosse più deboli (ADR 0038).
    Dal 27/11/2026 l'Elo è unico su tutte le competizioni (ADR 0079, prova `ratings` su
    3.517 partite dal 1/7/2024: Log Loss 1X2 −0,0017 ± 0,0013, al posto di quello per
    competizione).
    """
    goals = GoalsModel(
        "dixon_coles",
        dixon_coles=True,
        xi=0.001,
        l2=DEFAULT_L2,
        newcomer_attack=NEWCOMER_ATTACK,
        newcomer_defence=NEWCOMER_DEFENCE,
    )
    return JointEloBlendModel(
        "dixon_coles",
        goals,
        Elo(scope="all"),
        ELO_WEIGHT,
        joint_weight=JOINT_WEIGHT,
        joint_xi=JOINT_XI,
        joint_l2=DEFAULT_L2,
    )
