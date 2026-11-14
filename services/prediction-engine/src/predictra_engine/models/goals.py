"""Modelli gol: Poisson (Maher) e Dixon-Coles (ADR 0021).

log λ_casa = μ + h + att_casa − dif_ospite;  log λ_ospite = μ + att_ospite − dif_casa.
Dixon-Coles aggiunge la correzione τ(ρ) sui punteggi 0-0, 0-1, 1-0, 1-1 e pesi
esponenziali nel tempo exp(−ξ·giorni). Una leggera penalità L2 su attacco e difesa
stabilizza la stima con poche partite; una squadra senza partite ha forza media.

ADR 0038: anche Poisson pesa di più le partite recenti, e una squadra arrivata da poco
nella competizione (neopromossa: assente nell'anno prima degli ultimi ``newcomer_days``
giorni) parte da una forza più bassa della media invece che da zero.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
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
    def __init__(
        self,
        key: str,
        *,
        dixon_coles: bool,
        xi: float,
        l2: float = 0.1,
        newcomer_attack: float = 0.0,
        newcomer_defence: float = 0.0,
        newcomer_days: int = 300,
    ) -> None:
        self.key = key
        self.dixon_coles = dixon_coles
        self.xi = xi
        self.l2 = l2
        self.newcomer_attack = newcomer_attack
        self.newcomer_defence = newcomer_defence
        self.newcomer_days = newcomer_days

    @property
    def _uses_newcomer_prior(self) -> bool:
        return bool(self.newcomer_attack or self.newcomer_defence)

    def hyperparameters(self) -> dict[str, Any]:
        params: dict[str, Any] = {
            "dixon_coles": self.dixon_coles,
            "xi_per_day": self.xi,
            "l2": self.l2,
        }
        # Solo se attivo: le versioni senza prior restano identiche a prima.
        if self._uses_newcomer_prior:
            params["newcomer"] = {
                "attack": self.newcomer_attack,
                "defence": self.newcomer_defence,
                "days": self.newcomer_days,
            }
        return params

    def newcomers(self, results: list[MatchResult], as_of: datetime) -> set[int]:
        """Squadre presenti negli ultimi ``newcomer_days`` giorni ma assenti nell'anno prima.

        Vuoto se la competizione non ha partite in quell'anno (storico troppo corto).
        """
        cut = as_of - timedelta(days=self.newcomer_days)
        prev = cut - timedelta(days=365)
        before: set[int] = set()
        recent: set[int] = set()
        for r in results:
            if prev <= r.kickoff_at < cut:
                before.update((r.home, r.away))
            elif cut <= r.kickoff_at < as_of:
                recent.update((r.home, r.away))
        return recent - before if before else set()

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
        # Forza di partenza: zero (media) per tutti, più bassa per le neopromosse (ADR 0038).
        new = self.newcomers(results, as_of) if self._uses_newcomer_prior else set()
        flag = np.array([1.0 if t in new else 0.0 for t in team_ids])
        att_prior = flag * self.newcomer_attack
        dfn_prior = flag * self.newcomer_defence

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
            penalty = ((att - att_prior) ** 2).sum() + ((dfn - dfn_prior) ** 2).sum()
            return float(-(w * ll).sum() + self.l2 * penalty)

        size = 2 + 2 * n + (1 if self.dixon_coles else 0)
        start = np.zeros(size)
        start[0] = np.log(max(np.average((hg + ag) / 2, weights=w), 0.1))
        start[1] = 0.2
        start[2 : 2 + n] = att_prior
        start[2 + n : 2 + 2 * n] = dfn_prior
        bounds = [(None, None)] * (2 + 2 * n) + ([(-0.2, 0.2)] if self.dixon_coles else [])
        res = minimize(nll, start, method="L-BFGS-B", bounds=bounds)
        mu, home, att, dfn, rho = unpack(res.x)
        return GoalsFit(teams, float(mu), float(home), att, dfn, float(rho), len(results))


# Valori scelti con la taratura dell'8/11/2026 (docs/operations/prediction-engine.md):
# L2 = 3 minimizza il Log Loss del backtest walk-forward su 560 partite reali.
DEFAULT_L2 = 3.0

# ADR 0038 (14/11/2026): con lo storico 2022–2026 il peso del tempo e le neopromosse più
# deboli migliorano il backtest (3.483 partite di prova: Log Loss 1X2 da 0,9928 a 0,9899
# per Poisson, da 0,9960 a 0,9897 per Dixon-Coles). Il backtest sul database ne conferma
# o smentisce il vantaggio e l'attivazione automatica (ADR 0023) sceglie il più forte.
NEWCOMER_ATTACK = -0.2
NEWCOMER_DEFENCE = -0.1


def poisson_model() -> GoalsModel:
    # ξ = 0,0015 al giorno: emivita di circa 15 mesi.
    return GoalsModel(
        "poisson",
        dixon_coles=False,
        xi=0.0015,
        l2=DEFAULT_L2,
        newcomer_attack=NEWCOMER_ATTACK,
        newcomer_defence=NEWCOMER_DEFENCE,
    )


def dixon_coles_model() -> GoalsModel:
    # ξ = 0,001 al giorno: emivita di circa 23 mesi (0,005 pesava troppo poco le stagioni
    # passate ora che lo storico ne contiene quattro).
    return GoalsModel(
        "dixon_coles",
        dixon_coles=True,
        xi=0.001,
        l2=DEFAULT_L2,
        newcomer_attack=NEWCOMER_ATTACK,
        newcomer_defence=NEWCOMER_DEFENCE,
    )
