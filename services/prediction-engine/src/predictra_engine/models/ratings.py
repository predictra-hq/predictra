"""Valutazioni di squadra su tutte le competizioni insieme (prova del 26/11/2026, ADR 0079).

Due modelli che usano solo i risultati, con le squadre comuni a tutte le competizioni (le
partite europee collegano i campionati, come il modello gol unico dell'ADR 0074):

- **Pi-ratings** (Constantinou e Fenton, 2013): ogni squadra ha una valutazione in casa e
  una in trasferta, in «gol di scarto». Dopo ogni partita si corregge in base all'errore
  sullo scarto previsto, con rendimenti decrescenti (un 5-0 non vale cinque volte un 1-0);
  la correzione in casa passa in parte a quella in trasferta e viceversa.
- **Elo unico:** l'Elo attuale (ADR 0021), ma con una sola valutazione per squadra su tutte
  le competizioni invece di una per competizione.

In entrambi lo scarto previsto diventa 1X2 con lo stesso modello logistico ordinale
dell'Elo, stimato sulle partite di addestramento. Nessun dato successivo ad ``as_of``.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np
from scipy.optimize import minimize

from ..data import MatchResult
from .base import CompetitionFit, FittedModel, Model
from .elo import INITIAL_RATING, ordinal_probabilities

# Valori iniziali del modello ordinale (≈ 45/27/28 a parità di forza), come l'Elo.
ORDINAL_START = (-0.95, 0.15)


def fit_ordinal(
    diffs: np.ndarray, outcomes: np.ndarray, beta0: float
) -> tuple[float, float, float]:
    """Stima c1, c2 e β del modello ordinale per massima verosimiglianza (con una leggera
    regolarizzazione verso i valori iniziali, così con pochi dati restano ragionevoli)."""
    start = np.array([ORDINAL_START[0], ORDINAL_START[1], beta0])
    if len(diffs) < 10:
        c1, gap, beta = start
        return float(c1), float(c1 + gap), float(beta)
    scale = np.array([1.0, 1.0, beta0])

    def nll(theta: np.ndarray) -> float:
        c1, gap, beta = theta * scale
        probs = ordinal_probabilities(diffs, c1, c1 + abs(gap) + 1e-6, beta)
        ll = np.log(probs[np.arange(len(outcomes)), outcomes]).sum()
        return float(-ll + 0.5 * ((theta - start / scale) ** 2).sum())

    res = minimize(nll, start / scale, method="Nelder-Mead", options={"maxiter": 400})
    c1, gap, beta = res.x * scale
    return float(c1), float(c1 + abs(gap) + 1e-6), float(beta)


@dataclass
class GlobalFit(CompetitionFit):
    """Una competizione vista da un modello globale: stesse valutazioni per tutte."""

    model_key: str
    state: Any
    c1: float
    c2: float
    beta: float
    teams: frozenset[int] = frozenset()
    """Squadre della competizione: di queste si salvano le valutazioni (ADR 0020)."""

    def probabilities_1x2(self, home: int, away: int) -> np.ndarray:
        p = ordinal_probabilities(self.state.diff(home, away), self.c1, self.c2, self.beta)
        return p / p.sum()

    def parameters(self) -> dict[str, Any]:
        return {
            "model": self.model_key,
            "scope": "all",
            "ratings": self.state.ratings_for(self.teams),
            "c1": round(self.c1, 6),
            "c2": round(self.c2, 6),
            "beta": round(self.beta, 8),
        }


class GlobalRatingModel(Model):
    """Base dei modelli con valutazioni comuni a tutte le competizioni."""

    beta0: float = 0.004

    def new_state(self) -> Any:  # pragma: no cover - astratto
        raise NotImplementedError

    def fit_competition(self, results: list[MatchResult], as_of: datetime) -> CompetitionFit:
        raise NotImplementedError("modello globale: usare fit()")

    def fit(self, results: list[MatchResult], as_of: datetime) -> FittedModel:
        past = sorted(
            (r for r in results if r.kickoff_at < as_of), key=lambda r: (r.kickoff_at, r.match_id)
        )
        state = self.new_state()
        diffs, outcomes = [], []
        by_comp: dict[int, list[MatchResult]] = defaultdict(list)
        for r in past:
            diffs.append(state.diff(r.home, r.away))
            outcomes.append(r.outcome)
            state.update(r)
            by_comp[r.competition_id].append(r)
        c1, c2, beta = fit_ordinal(np.array(diffs), np.array(outcomes), self.beta0)
        fits: dict[int, CompetitionFit] = {
            comp: GlobalFit(
                self.key,
                state,
                c1,
                c2,
                beta,
                frozenset(t for r in rows for t in (r.home, r.away)),
            )
            for comp, rows in sorted(by_comp.items())
        }
        return FittedModel(self, fits, by_comp)


class _PiState:
    def __init__(self, lam: float, gamma: float, base: float, c: float) -> None:
        self.lam, self.gamma, self.base, self.c = lam, gamma, base, c
        self.home: dict[int, float] = defaultdict(float)
        self.away: dict[int, float] = defaultdict(float)

    def _goals(self, rating: float) -> float:
        """Scarto atteso da una valutazione: b^(|R|/c) − 1, con il segno di R."""
        g = self.base ** (abs(rating) / self.c) - 1
        return g if rating >= 0 else -g

    def diff(self, home: int, away: int) -> float:
        # .get: una previsione non deve aggiungere squadre allo stato.
        return self._goals(self.home.get(home, 0.0)) - self._goals(self.away.get(away, 0.0))

    def ratings_for(self, teams: frozenset[int]) -> dict[str, list[float]]:
        return {
            str(t): [round(self.home.get(t, 0.0), 5), round(self.away.get(t, 0.0), 5)]
            for t in sorted(teams)
        }

    def update(self, r: MatchResult) -> None:
        error = (r.home_goals - r.away_goals) - self.diff(r.home, r.away)
        psi = self.c * math.log(1 + abs(error), self.base)
        psi = psi if error >= 0 else -psi
        step_home = psi * self.lam
        self.home[r.home] += step_home
        self.away[r.home] += step_home * self.gamma
        step_away = -psi * self.lam
        self.away[r.away] += step_away
        self.home[r.away] += step_away * self.gamma


class PiRatings(GlobalRatingModel):
    key = "pi_ratings"
    beta0 = 0.6

    def __init__(self, lam: float = 0.035, gamma: float = 0.7, base: float = 10.0, c: float = 3.0):
        self.lam, self.gamma, self.base, self.c = lam, gamma, base, c

    def hyperparameters(self) -> dict[str, Any]:
        return {"lambda": self.lam, "gamma": self.gamma, "base": self.base, "c": self.c}

    def new_state(self) -> _PiState:
        return _PiState(self.lam, self.gamma, self.base, self.c)


class _EloState:
    def __init__(self, k: float, home_advantage: float) -> None:
        self.k, self.home_advantage = k, home_advantage
        self.ratings: dict[int, float] = defaultdict(lambda: INITIAL_RATING)

    def diff(self, home: int, away: int) -> float:
        return (
            self.ratings.get(home, INITIAL_RATING)
            + self.home_advantage
            - self.ratings.get(away, INITIAL_RATING)
        )

    def ratings_for(self, teams: frozenset[int]) -> dict[str, float]:
        return {str(t): round(self.ratings.get(t, INITIAL_RATING), 3) for t in sorted(teams)}

    def update(self, r: MatchResult) -> None:
        d = self.diff(r.home, r.away)
        expected = 1 / (1 + 10 ** (-d / 400))
        score = 1.0 if r.outcome == 0 else 0.5 if r.outcome == 1 else 0.0
        self.ratings[r.home] += self.k * (score - expected)
        self.ratings[r.away] -= self.k * (score - expected)


class GlobalElo(GlobalRatingModel):
    key = "elo_unico"
    beta0 = 0.004

    def __init__(self, k: float = 20.0, home_advantage: float = 60.0) -> None:
        self.k, self.home_advantage = k, home_advantage

    def hyperparameters(self) -> dict[str, Any]:
        return {"k": self.k, "home_advantage": self.home_advantage}

    def new_state(self) -> _EloState:
        return _EloState(self.k, self.home_advantage)
