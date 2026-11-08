"""Modelli gol: Poisson (Maher) e Dixon-Coles (ADR 0021).

log λ_casa = μ + h + att_casa − dif_ospite;  log λ_ospite = μ + att_ospite − dif_casa.
Dixon-Coles aggiunge la correzione τ(ρ) sui punteggi 0-0, 0-1, 1-0, 1-1 e pesi
esponenziali nel tempo exp(−ξ·giorni). Una leggera penalità L2 su attacco e difesa
stabilizza la stima con poche partite; una squadra senza partite ha forza media.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln
from scipy.stats import poisson

from ..data import MatchResult
from .base import CompetitionFit, Model

MAX_GOALS = 10


def tau(hg: np.ndarray, ag: np.ndarray, lh: np.ndarray, la: np.ndarray, rho: float) -> np.ndarray:
    t = np.ones_like(lh)
    t = np.where((hg == 0) & (ag == 0), 1 - lh * la * rho, t)
    t = np.where((hg == 0) & (ag == 1), 1 + lh * rho, t)
    t = np.where((hg == 1) & (ag == 0), 1 + la * rho, t)
    t = np.where((hg == 1) & (ag == 1), 1 - rho, t)
    return np.clip(t, 1e-10, None)


def score_matrix(lh: float, la: float, rho: float = 0.0, max_goals: int = MAX_GOALS) -> np.ndarray:
    """Matrice P(casa = h, ospite = a) per h, a in 0..max_goals, normalizzata a 1."""
    goals = np.arange(max_goals + 1)
    m = np.outer(poisson.pmf(goals, lh), poisson.pmf(goals, la))
    if rho:
        m[0, 0] *= 1 - lh * la * rho
        m[0, 1] *= 1 + lh * rho
        m[1, 0] *= 1 + la * rho
        m[1, 1] *= 1 - rho
    m = np.clip(m, 0, None)
    return m / m.sum()


@dataclass
class GoalsFit(CompetitionFit):
    teams: dict[int, int]
    mu: float
    home: float
    attack: np.ndarray
    defence: np.ndarray
    rho: float
    matches: int

    def _strength(self, team: int) -> tuple[float, float]:
        i = self.teams.get(team)
        return (0.0, 0.0) if i is None else (float(self.attack[i]), float(self.defence[i]))

    def lambdas(self, home: int, away: int) -> tuple[float, float, float | None]:
        ah, dh = self._strength(home)
        aa, da = self._strength(away)
        lh = float(np.exp(self.mu + self.home + ah - da))
        la = float(np.exp(self.mu + aa - dh))
        return lh, la, self.rho

    def score_matrix(self, home: int, away: int) -> np.ndarray:
        lh, la, rho = self.lambdas(home, away)
        return score_matrix(lh, la, rho or 0.0)

    def probabilities_1x2(self, home: int, away: int) -> np.ndarray:
        m = self.score_matrix(home, away)
        return np.array([np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()])

    def parameters(self) -> dict[str, Any]:
        return {
            "mu": round(self.mu, 6),
            "home": round(self.home, 6),
            "rho": round(self.rho, 6),
            "attack": {
                str(t): round(float(self.attack[i]), 6) for t, i in sorted(self.teams.items())
            },
            "defence": {
                str(t): round(float(self.defence[i]), 6) for t, i in sorted(self.teams.items())
            },
            "matches": self.matches,
        }


class GoalsModel(Model):
    def __init__(self, key: str, *, dixon_coles: bool, xi: float, l2: float = 0.1) -> None:
        self.key = key
        self.dixon_coles = dixon_coles
        self.xi = xi
        self.l2 = l2

    def hyperparameters(self) -> dict[str, Any]:
        return {"dixon_coles": self.dixon_coles, "xi_per_day": self.xi, "l2": self.l2}

    def fit_competition(self, results: list[MatchResult], as_of: datetime) -> GoalsFit:
        team_ids = sorted({r.home for r in results} | {r.away for r in results})
        teams = {t: i for i, t in enumerate(team_ids)}
        n = len(team_ids)
        if not results:
            return GoalsFit(teams, float(np.log(1.3)), 0.25, np.zeros(n), np.zeros(n), 0.0, 0)

        hi = np.array([teams[r.home] for r in results])
        ai = np.array([teams[r.away] for r in results])
        hg = np.array([r.home_goals for r in results], dtype=float)
        ag = np.array([r.away_goals for r in results], dtype=float)
        days = np.array([(as_of - r.kickoff_at).total_seconds() / 86400 for r in results])
        w = np.exp(-self.xi * days)
        const = gammaln(hg + 1) + gammaln(ag + 1)

        def unpack(theta: np.ndarray) -> tuple[float, float, np.ndarray, np.ndarray, float]:
            mu, home = theta[0], theta[1]
            att = theta[2 : 2 + n] - theta[2 : 2 + n].mean()
            dfn = theta[2 + n : 2 + 2 * n] - theta[2 + n : 2 + 2 * n].mean()
            rho = theta[-1] if self.dixon_coles else 0.0
            return mu, home, att, dfn, rho

        def nll(theta: np.ndarray) -> float:
            mu, home, att, dfn, rho = unpack(theta)
            lh = np.exp(mu + home + att[hi] - dfn[ai])
            la = np.exp(mu + att[ai] - dfn[hi])
            ll = hg * np.log(lh) - lh + ag * np.log(la) - la - const
            if self.dixon_coles:
                ll = ll + np.log(tau(hg, ag, lh, la, rho))
            return float(-(w * ll).sum() + self.l2 * ((att**2).sum() + (dfn**2).sum()))

        size = 2 + 2 * n + (1 if self.dixon_coles else 0)
        start = np.zeros(size)
        start[0] = np.log(max(np.average((hg + ag) / 2, weights=w), 0.1))
        start[1] = 0.2
        bounds = [(None, None)] * (2 + 2 * n) + ([(-0.2, 0.2)] if self.dixon_coles else [])
        res = minimize(nll, start, method="L-BFGS-B", bounds=bounds)
        mu, home, att, dfn, rho = unpack(res.x)
        return GoalsFit(teams, float(mu), float(home), att, dfn, float(rho), len(results))


def poisson_model() -> GoalsModel:
    return GoalsModel("poisson", dixon_coles=False, xi=0.0)


def dixon_coles_model() -> GoalsModel:
    # ξ = 0,0019 al giorno: emivita di circa un anno (ordine di grandezza di Dixon e Coles, 1997).
    return GoalsModel("dixon_coles", dixon_coles=True, xi=0.0019)
