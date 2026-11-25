"""Modello gol unico su tutte le competizioni (ADR 0074).

Attacco e difesa di ogni squadra sono **comuni a tutte le competizioni**; ogni
competizione ha il suo livello di gol (μ) e il suo vantaggio casalingo. Le partite tra
squadre di campionati diversi (Champions League) collegano i campionati tra loro, e una
neopromossa porta con sé le partite della serie inferiore quando sono nei dati.

    log λ_casa = μ_c + h_c + att_casa − dif_ospite;  log λ_ospite = μ_c + att_ospite − dif_casa

Pesi nel tempo exp(−ξ·giorni) e penalità L2 come nel modello per competizione; gradiente
esatto, quindi l'adattamento su migliaia di partite richiede frazioni di secondo.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln

from ..data import Fixture, MatchResult
from .goals import score_matrix


@dataclass
class JointFit:
    """Forze comuni a tutte le competizioni, livello e vantaggio casalingo per competizione."""

    teams: dict[int, int]
    comps: dict[int, int]
    mu: np.ndarray
    home: np.ndarray
    attack: np.ndarray
    defence: np.ndarray

    def covers(self, fixture: Fixture) -> bool:
        return fixture.competition_id in self.comps

    def _strength(self, team: int) -> tuple[float, float]:
        i = self.teams.get(team)
        return (0.0, 0.0) if i is None else (float(self.attack[i]), float(self.defence[i]))

    def lambdas_for(self, competition_id: int, home: int, away: int) -> tuple[float, float]:
        c = self.comps[competition_id]
        ah, dh = self._strength(home)
        aa, da = self._strength(away)
        lh = float(np.exp(self.mu[c] + self.home[c] + ah - da))
        la = float(np.exp(self.mu[c] + aa - dh))
        return lh, la

    def probabilities_1x2(self, fixture: Fixture) -> np.ndarray:
        return self.probabilities_for(fixture.competition_id, fixture.home, fixture.away)

    def probabilities_for(self, competition_id: int, home: int, away: int) -> np.ndarray:
        m = score_matrix(*self.lambdas_for(competition_id, home, away))
        return np.array([np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()])

    def parameters_for(self, competition_id: int, teams: dict[int, int]) -> dict[str, Any]:
        """Valori salvati con la versione: livello della competizione e forze delle sue squadre."""
        c = self.comps.get(competition_id)
        known = sorted(t for t in teams if t in self.teams)
        return {
            "mu": None if c is None else round(float(self.mu[c]), 6),
            "home": None if c is None else round(float(self.home[c]), 6),
            "attack": {str(t): round(float(self.attack[self.teams[t]]), 6) for t in known},
            "defence": {str(t): round(float(self.defence[self.teams[t]]), 6) for t in known},
        }


Objective = Callable[[np.ndarray], tuple[float, np.ndarray]]


def _problem(
    results: list[MatchResult], as_of: datetime, xi: float, l2: float
) -> tuple[dict[int, int], dict[int, int], Objective, np.ndarray]:
    """Squadre, competizioni, funzione obiettivo con gradiente esatto e punto di partenza."""
    rows = [r for r in results if r.kickoff_at < as_of]
    team_ids = sorted({r.home for r in rows} | {r.away for r in rows})
    comp_ids = sorted({r.competition_id for r in rows})
    teams = {t: i for i, t in enumerate(team_ids)}
    comps = {c: i for i, c in enumerate(comp_ids)}
    n, k = len(team_ids), len(comp_ids)
    hi = np.array([teams[r.home] for r in rows])
    ai = np.array([teams[r.away] for r in rows])
    ci = np.array([comps[r.competition_id] for r in rows])
    hg = np.array([r.home_goals for r in rows], dtype=float)
    ag = np.array([r.away_goals for r in rows], dtype=float)
    days = np.array([(as_of - r.kickoff_at).total_seconds() / 86400 for r in rows])
    w = np.exp(-xi * days)
    const = float((w * (gammaln(hg + 1) + gammaln(ag + 1))).sum())

    def f(theta: np.ndarray) -> tuple[float, np.ndarray]:
        mu, home = theta[:k], theta[k : 2 * k]
        att, dfn = theta[2 * k : 2 * k + n], theta[2 * k + n :]
        eh = mu[ci] + home[ci] + att[hi] - dfn[ai]
        ea = mu[ci] + att[ai] - dfn[hi]
        lh, la = np.exp(eh), np.exp(ea)
        value = -float((w * (hg * eh - lh + ag * ea - la)).sum()) + const
        value += l2 * float((att**2).sum() + (dfn**2).sum())
        gh = -w * (hg - lh)
        ga = -w * (ag - la)
        grad = np.empty_like(theta)
        grad[:k] = np.bincount(ci, gh + ga, minlength=k)
        grad[k : 2 * k] = np.bincount(ci, gh, minlength=k)
        grad[2 * k : 2 * k + n] = (
            np.bincount(hi, gh, minlength=n) + np.bincount(ai, ga, minlength=n) + 2 * l2 * att
        )
        grad[2 * k + n :] = (
            -np.bincount(ai, gh, minlength=n) - np.bincount(hi, ga, minlength=n) + 2 * l2 * dfn
        )
        return value, grad

    start = np.zeros(2 * k + 2 * n)
    for i in comps.values():
        sel = ci == i
        avg = np.average((hg[sel] + ag[sel]) / 2, weights=w[sel]) if w[sel].sum() > 0 else 1.3
        start[i] = np.log(max(avg, 0.1))
        start[k + i] = 0.2
    return teams, comps, f, start


def objective(
    results: list[MatchResult], as_of: datetime, xi: float, l2: float
) -> tuple[Objective, int]:
    """Funzione obiettivo e numero di parametri (per il controllo del gradiente nei test)."""
    _, _, f, start = _problem(results, as_of, xi, l2)
    return f, len(start)


def fit_joint(results: list[MatchResult], as_of: datetime, xi: float, l2: float) -> JointFit:
    """Poisson con forze comuni, gradiente esatto (L-BFGS)."""
    teams, comps, f, start = _problem(results, as_of, xi, l2)
    k, n = len(comps), len(teams)
    res = minimize(f, start, jac=True, method="L-BFGS-B", options={"maxiter": 2000})
    theta = res.x
    return JointFit(
        teams,
        comps,
        theta[:k],
        theta[k : 2 * k],
        theta[2 * k : 2 * k + n],
        theta[2 * k + n :],
    )
