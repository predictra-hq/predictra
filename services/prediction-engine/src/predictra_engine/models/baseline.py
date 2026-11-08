"""Baseline: frequenze storiche di 1/X/2 della competizione (ADR 0021)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np

from ..data import MatchResult
from .base import CompetitionFit, Model


@dataclass
class BaselineFit(CompetitionFit):
    probs: np.ndarray
    matches: int

    def probabilities_1x2(self, home: int, away: int) -> np.ndarray:
        return self.probs.copy()

    def parameters(self) -> dict[str, Any]:
        return {"p": [round(float(x), 6) for x in self.probs], "matches": self.matches}


class Baseline(Model):
    key = "baseline"

    def __init__(self, prior: float = 1.0) -> None:
        # Pseudo-conteggio di Laplace: evita probabilità nulle con pochi dati.
        self.prior = prior

    def hyperparameters(self) -> dict[str, Any]:
        return {"prior": self.prior}

    def fit_competition(self, results: list[MatchResult], as_of: datetime) -> BaselineFit:
        counts = np.full(3, self.prior)
        for r in results:
            counts[r.outcome] += 1
        return BaselineFit(counts / counts.sum(), len(results))
