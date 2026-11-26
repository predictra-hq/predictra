"""Interfaccia comune dei modelli. Ogni modello si adatta separatamente per competizione."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict
from datetime import datetime
from typing import Any

import numpy as np

from ..data import Fixture, MatchResult


class CompetitionFit(ABC):
    """Modello adattato su una competizione."""

    @abstractmethod
    def probabilities_1x2(self, home: int, away: int) -> np.ndarray: ...

    def score_matrix(self, home: int, away: int) -> np.ndarray | None:
        return None

    def lambdas(self, home: int, away: int) -> tuple[float, float, float | None] | None:
        return None

    # Come si ricava la matrice dei risultati da λ e ρ salvati (riproducibilità, ADR 0020,
    # 0078). None: la matrice è quella di Dixon-Coles con λ e ρ, senza altri passaggi.
    matrix_from: str | None = None

    @abstractmethod
    def parameters(self) -> dict[str, Any]: ...


class Model(ABC):
    key: str

    @abstractmethod
    def hyperparameters(self) -> dict[str, Any]: ...

    @abstractmethod
    def fit_competition(self, results: list[MatchResult], as_of: datetime) -> CompetitionFit: ...

    def fit(self, results: list[MatchResult], as_of: datetime) -> FittedModel:
        """Adatta il modello su ogni competizione usando solo partite con kickoff < as_of."""
        by_comp: dict[int, list[MatchResult]] = defaultdict(list)
        for r in results:
            if r.kickoff_at < as_of:
                by_comp[r.competition_id].append(r)
        fits = {
            comp: self.fit_competition(
                sorted(rows, key=lambda r: (r.kickoff_at, r.match_id)), as_of
            )
            for comp, rows in sorted(by_comp.items())
        }
        return FittedModel(self, fits, by_comp)


class FittedModel:
    def __init__(
        self,
        model: Model,
        fits: dict[int, CompetitionFit],
        training: dict[int, list[MatchResult]],
    ) -> None:
        self.model = model
        self.fits = fits
        self._games: dict[tuple[int, int], int] = defaultdict(int)
        for comp, rows in training.items():
            for r in rows:
                self._games[(comp, r.home)] += 1
                self._games[(comp, r.away)] += 1

    def covers(self, fixture: Fixture) -> bool:
        return fixture.competition_id in self.fits

    def probabilities_1x2(self, fixture: Fixture) -> np.ndarray:
        return self.fits[fixture.competition_id].probabilities_1x2(fixture.home, fixture.away)

    def score_matrix(self, fixture: Fixture) -> np.ndarray | None:
        return self.fits[fixture.competition_id].score_matrix(fixture.home, fixture.away)

    def lambdas(self, fixture: Fixture) -> tuple[float, float, float | None] | None:
        return self.fits[fixture.competition_id].lambdas(fixture.home, fixture.away)

    def matrix_from(self, fixture: Fixture) -> str | None:
        return self.fits[fixture.competition_id].matrix_from

    def games_played(self, fixture: Fixture) -> int:
        """Partite di addestramento della squadra che ne ha meno (ADR 0022, S_campione)."""
        comp = fixture.competition_id
        return min(self._games[(comp, fixture.home)], self._games[(comp, fixture.away)])

    def parameters(self) -> dict[str, Any]:
        return {str(comp): fit.parameters() for comp, fit in self.fits.items()}
