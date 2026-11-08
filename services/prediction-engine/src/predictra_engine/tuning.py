"""Taratura degli iperparametri dei modelli gol, in sola lettura.

Per ogni combinazione della griglia esegue lo stesso backtest walk-forward usato
per le versioni (ADR 0020 §4), sulle stesse partite della baseline, e confronta
Brier, Log Loss ed ECE. Non scrive nulla: serve a scegliere i valori predefiniti.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import product

from .backtest import backtest_models
from .data import MatchResult
from .models import Baseline, Elo
from .models.base import Model
from .models.goals import GoalsModel

L2_GRID = (0.1, 1.0, 3.0, 10.0, 30.0)
XI_GRID = (0.0, 0.0019, 0.005)


@dataclass
class TuningRow:
    label: str
    matches: int
    brier: float
    log_loss: float
    ece: float
    beats_baseline: bool


def candidates(l2_grid=L2_GRID, xi_grid=XI_GRID) -> list[Model]:  # type: ignore[no-untyped-def]
    models: list[Model] = [Baseline(), Elo()]
    for l2 in l2_grid:
        models.append(GoalsModel(f"poisson[l2={l2}]", dixon_coles=False, xi=0.0, l2=l2))
    for l2, xi in product(l2_grid, xi_grid):
        models.append(GoalsModel(f"dixon_coles[l2={l2},xi={xi}]", dixon_coles=True, xi=xi, l2=l2))
    return models


def tune(results: list[MatchResult], models: list[Model] | None = None) -> list[TuningRow]:
    backtests = backtest_models(models or candidates(), results)
    base = backtests["baseline"]
    rows = [
        TuningRow(
            label=key,
            matches=bt.matches,
            brier=bt.brier,
            log_loss=bt.log_loss,
            ece=bt.ece,
            beats_baseline=key != "baseline"
            and bt.brier < base.brier
            and bt.log_loss < base.log_loss,
        )
        for key, bt in backtests.items()
    ]
    return sorted(rows, key=lambda r: (r.log_loss, r.brier))
