"""Prova in sola lettura: statistiche di partita (tiri, xG) nel modello gol.

Comando ``stats``: misura la copertura di ``match_team_statistics`` e confronta, con un
backtest walk-forward settimanale sulle stesse partite, il modello gol allenato sui gol
con lo stesso modello allenato su un misto di gol e "gol attesi":

    y = (1 − a)·gol + a·attesi,  attesi = expected_goals se c'è, altrimenti
    tiri in porta × (gol ÷ tiri in porta della competizione, sulle partite passate).

La valutazione usa sempre i risultati veri. Non scrive nulla.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np

from .data import Fixture, MatchResult
from .metrics import log_loss
from .models.base import CompetitionFit, Model
from .models.blend import dixon_coles_model
from .models.goals import poisson_model

STATS = ("shots_on_goal", "expected_goals", "total_shots")
EVAL_FROM = datetime(2024, 7, 1, tzinfo=UTC)
WEIGHTS = (0.3, 0.5, 0.7)


@dataclass(frozen=True)
class TeamStats:
    shots_on_goal: float | None = None
    expected_goals: float | None = None


def team_stats(rows: list[dict[str, Any]]) -> dict[tuple[int, int], TeamStats]:
    """(match_id, team_id) → statistiche, dalle righe di ``match_team_statistics``."""
    out: dict[tuple[int, int], dict[str, float]] = defaultdict(dict)
    for r in rows:
        if r.get("value") is None:
            continue
        out[(int(r["match_id"]), int(r["team_id"]))][str(r["stat"])] = float(r["value"])
    return {k: TeamStats(v.get("shots_on_goal"), v.get("expected_goals")) for k, v in out.items()}


def conversion_rates(
    results: list[MatchResult], stats: dict[tuple[int, int], TeamStats], before: datetime
) -> dict[int, float]:
    """Gol per tiro in porta di ogni competizione, solo sulle partite prima di ``before``."""
    goals: dict[int, float] = defaultdict(float)
    shots: dict[int, float] = defaultdict(float)
    for r in results:
        if r.kickoff_at >= before:
            continue
        for team, g in ((r.home, r.home_goals), (r.away, r.away_goals)):
            s = stats.get((r.match_id, team))
            if s and s.shots_on_goal is not None:
                goals[r.competition_id] += g
                shots[r.competition_id] += s.shots_on_goal
    return {c: goals[c] / shots[c] for c in shots if shots[c] > 0}


def expected(
    r: MatchResult, team: int, stats: dict[tuple[int, int], TeamStats], rate: float | None
) -> float | None:
    s = stats.get((r.match_id, team))
    if s is None:
        return None
    if s.expected_goals is not None:
        return s.expected_goals
    if s.shots_on_goal is not None and rate is not None:
        return s.shots_on_goal * rate
    return None


class MixedGoals(Model):
    """Modello gol allenato su gol misti a gol attesi; prevede come il modello di base."""

    def __init__(self, base: Model, weight: float, stats: dict[tuple[int, int], TeamStats]):
        self.key = f"{base.key}[attesi={weight}]"
        self.base = base
        self.weight = weight
        self.stats = stats

    def hyperparameters(self) -> dict[str, Any]:
        return {**self.base.hyperparameters(), "expected_weight": self.weight}

    def fit_competition(self, results: list[MatchResult], as_of: datetime) -> CompetitionFit:
        rates = conversion_rates(results, self.stats, as_of)
        mixed = []
        for r in results:
            rate = rates.get(r.competition_id)
            eh = expected(r, r.home, self.stats, rate)
            ea = expected(r, r.away, self.stats, rate)
            if eh is None or ea is None:
                mixed.append(r)
                continue
            a = self.weight
            mixed.append(
                replace(
                    r,
                    home_goals=(1 - a) * r.home_goals + a * eh,  # type: ignore[arg-type]
                    away_goals=(1 - a) * r.away_goals + a * ea,  # type: ignore[arg-type]
                )
            )
        return self.base.fit_competition(mixed, as_of)


def walk(model: Model, results: list[MatchResult], start: datetime) -> dict[int, np.ndarray]:
    """Previsioni 1X2 settimanali dal ``start``: match_id → probabilità."""
    out: dict[int, np.ndarray] = {}
    cursor, last = start, results[-1].kickoff_at
    while cursor <= last:
        end = cursor + timedelta(days=7)
        targets = [r for r in results if cursor <= r.kickoff_at < end]
        if targets:
            fitted = model.fit(results, cursor)
            for r in targets:
                fx = Fixture(r.match_id, r.competition_id, r.kickoff_at, r.home, r.away)
                if fitted.covers(fx):
                    out[r.match_id] = fitted.probabilities_1x2(fx)
        cursor = end
    return out


def coverage(results: list[MatchResult], stats: dict[tuple[int, int], TeamStats]) -> list[str]:
    lines = []
    by_comp: dict[int, list[int]] = defaultdict(lambda: [0, 0, 0])
    for r in results:
        c = by_comp[r.competition_id]
        c[0] += 1
        h, a = stats.get((r.match_id, r.home)), stats.get((r.match_id, r.away))
        if h and a and h.shots_on_goal is not None and a.shots_on_goal is not None:
            c[1] += 1
        if h and a and h.expected_goals is not None and a.expected_goals is not None:
            c[2] += 1
    for comp, (n, sot, xg) in sorted(by_comp.items()):
        lines.append(f"  competizione {comp}: partite {n}, con tiri in porta {sot}, con xG {xg}")
    return lines


def experiment(
    results: list[MatchResult], stats: dict[tuple[int, int], TeamStats], start: datetime = EVAL_FROM
) -> list[str]:
    results = sorted(results, key=lambda r: (r.kickoff_at, r.match_id))
    models: list[Model] = [poisson_model(), dixon_coles_model()]
    models += [MixedGoals(poisson_model(), w, stats) for w in WEIGHTS]
    preds = {m.key: walk(m, results, start) for m in models}
    common = set.intersection(*(set(p) for p in preds.values()))
    with_stats = {
        r.match_id
        for r in results
        if r.match_id in common and (r.match_id, r.home) in stats and (r.match_id, r.away) in stats
    }
    by_id = {r.match_id: r for r in results}
    lines = [
        f"  partite valutate dal {start.date()}: {len(common)} (con statistiche: {len(with_stats)})"
    ]
    for key, p in preds.items():
        ids = sorted(common)
        y = np.array([by_id[i].outcome for i in ids])
        probs = np.array([p[i] for i in ids])
        line = f"  {key:<32} LogLoss={log_loss(probs, y):.4f}"
        if with_stats:
            ids_s = sorted(with_stats)
            ys = np.array([by_id[i].outcome for i in ids_s])
            ps = np.array([p[i] for i in ids_s])
            line += f"  (partite con statistiche: {log_loss(ps, ys):.4f})"
        lines.append(line)
    return lines


def run_stats(store: Any, as_of: datetime) -> list[str]:
    results = [MatchResult.from_row(r) for r in store.training_results(as_of)]
    stats = team_stats(store.match_statistics(STATS))
    lines = [f"Statistiche di partita (sola lettura) — as_of {as_of.isoformat()}"]
    lines.append(
        f"  partite di addestramento {len(results)}, squadre-partita con statistiche {len(stats)}"
    )
    lines += coverage(results, stats)
    if not stats:
        lines.append("  nessuna statistica: prova non eseguita")
        return lines
    lines += experiment(results, stats)
    return lines
