"""Taratura automatica del modello PREDICTRA (ADR 0056).

Ogni settimana, insieme al confronto dei backtest, il motore prova due varianti vicine
alle impostazioni attuali del modello (Dixon-Coles + Elo), su una impostazione per volta a
rotazione: quanto in fretta si dimenticano le partite vecchie (ξ), quanto il modello è
prudente (L2) e quanto conta l'Elo nell'1X2.
Ogni variante prevede le partite degli ultimi mesi come se fossero ancora da giocare (ogni
settimana vede solo le partite precedenti) e si confronta con i risultati veri.

Una variante si adotta solo se:
1. sulle partite recenti ha un Log Loss più basso di almeno ``MARGIN``;
2. sull'intero storico non è peggiore delle impostazioni attuali.

Le impostazioni adottate diventano una versione nuova, con il suo backtest e l'audit
dell'attivazione; la settimana dopo la ricerca riparte da lì. Così il modello migliora a
piccoli passi, sempre misurati su risultati reali, e non insegue il caso di una giornata.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from .backtest import backtest_models
from .data import MatchResult
from .models.base import Model
from .models.blend import EloBlendModel
from .models.elo import Elo
from .models.goals import GoalsModel
from .selection import MARGIN

# Partite usate per confrontare le varianti: gli ultimi sei mesi, abbastanza da non
# inseguire il caso (circa 1.500 partite) e abbastanza recenti da seguire il calcio di oggi.
RECENT_DAYS = 182
XI_STEPS = (0.5, 2.0)
L2_STEPS = (0.75, 4 / 3)
WEIGHT_STEP = 0.1
WEIGHT_RANGE = (0.1, 0.8)
XI_RANGE = (0.0002, 0.006)
L2_RANGE = (0.5, 12.0)


@dataclass(frozen=True)
class Settings:
    xi: float
    l2: float
    elo_weight: float

    def describe(self) -> str:
        return f"ξ {self.xi:g}, L2 {self.l2:g}, peso Elo {self.elo_weight:g}"


def settings_of(model: EloBlendModel) -> Settings:
    return Settings(model.goals.xi, model.goals.l2, model.weight)


def with_settings(model: EloBlendModel, s: Settings) -> EloBlendModel:
    """Stesso modello con altre impostazioni (il resto non cambia)."""
    g = model.goals
    goals = GoalsModel(
        g.key,
        dixon_coles=g.dixon_coles,
        xi=s.xi,
        l2=s.l2,
        newcomer_attack=g.newcomer_attack,
        newcomer_defence=g.newcomer_defence,
        newcomer_days=g.newcomer_days,
    )
    return EloBlendModel(model.key, goals, Elo(model.elo.k, model.elo.home_advantage), s.elo_weight)


def model_from_hyperparameters(base: EloBlendModel, hp: dict[str, Any]) -> EloBlendModel | None:
    """Ricostruisce il modello di una versione registrata dai suoi iperparametri.

    ``None`` se gli iperparametri non sono di un modello di questa forma: allora si usano
    le impostazioni predefinite del codice.
    """
    try:
        newcomer = hp.get("newcomer") or {}
        elo = hp.get("elo") or {}
        goals = GoalsModel(
            base.goals.key,
            dixon_coles=bool(hp["dixon_coles"]),
            xi=float(hp["xi_per_day"]),
            l2=float(hp["l2"]),
            newcomer_attack=float(newcomer.get("attack", 0.0)),
            newcomer_defence=float(newcomer.get("defence", 0.0)),
            newcomer_days=int(newcomer.get("days", 300)),
        )
        return EloBlendModel(
            base.key,
            goals,
            Elo(float(elo["k"]), float(elo["home_advantage"])),
            float(hp["elo_weight"]),
        )
    except (KeyError, TypeError, ValueError):
        return None


def _clip(value: float, bounds: tuple[float, float]) -> float:
    return min(max(value, bounds[0]), bounds[1])


# Una impostazione per settimana, a rotazione: due varianti invece di sei, così la
# taratura costa pochi minuti e resta dentro il lease del job (15 minuti).
DIMENSIONS = ("xi", "l2", "elo_weight")


def dimension_for(as_of: datetime) -> str:
    """Impostazione da provare nella settimana di ``as_of`` (a rotazione)."""
    return DIMENSIONS[as_of.isocalendar().week % len(DIMENSIONS)]


def neighbours(s: Settings, dimensions: tuple[str, ...] = DIMENSIONS) -> list[Settings]:
    """Varianti a un passo dalle impostazioni attuali, solo sulle impostazioni indicate."""
    out: list[Settings] = []
    if "xi" in dimensions:
        for f in XI_STEPS:
            xi = _clip(round((s.xi or XI_RANGE[0]) * f, 6), XI_RANGE)
            out.append(Settings(xi, s.l2, s.elo_weight))
    if "l2" in dimensions:
        for f in L2_STEPS:
            out.append(Settings(s.xi, _clip(round(s.l2 * f, 3), L2_RANGE), s.elo_weight))
    if "elo_weight" in dimensions:
        for d in (-WEIGHT_STEP, WEIGHT_STEP):
            w = _clip(round(s.elo_weight + d, 3), WEIGHT_RANGE)
            out.append(Settings(s.xi, s.l2, w))
    unique: list[Settings] = []
    for c in out:
        if c != s and c not in unique:
            unique.append(c)
    return unique


@dataclass
class Trial:
    settings: Settings
    log_loss: float
    brier: float
    matches: int


@dataclass
class AutotuneResult:
    current: Trial
    trials: list[Trial] = field(default_factory=list)
    best: Trial | None = None
    """La variante migliore sulle partite recenti, se batte quella attuale di ``MARGIN``."""

    def lines(self) -> list[str]:
        out = [
            f"  taratura automatica su {self.current.matches} partite recenti — attuale "
            f"[{self.current.settings.describe()}] LogLoss={self.current.log_loss:.4f}"
        ]
        for t in sorted(self.trials, key=lambda t: t.log_loss):
            out.append(f"    variante [{t.settings.describe()}] LogLoss={t.log_loss:.4f}")
        out.append(
            f"    → migliore: {self.best.settings.describe()}"
            if self.best
            else "    → nessuna variante migliore: impostazioni invariate"
        )
        return out


def autotune(
    model: EloBlendModel,
    results: list[MatchResult],
    as_of: datetime,
    *,
    recent_days: int = RECENT_DAYS,
    margin: float = MARGIN,
    dimensions: tuple[str, ...] | None = None,
) -> AutotuneResult | None:
    """Confronta le impostazioni attuali con le varianti vicine sulle partite recenti.

    Senza ``dimensions`` prova solo l'impostazione della settimana (``dimension_for``).
    """
    start = as_of - timedelta(days=recent_days)
    if not any(r.kickoff_at >= start for r in results):
        return None
    current = settings_of(model)
    variants = neighbours(current, dimensions or (dimension_for(as_of),))
    models: list[Model] = [with_settings(model, current)]
    keys = {"attuale": current}
    for i, s in enumerate(variants):
        m = with_settings(model, s)
        m.key = f"variante-{i}"
        models.append(m)
        keys[m.key] = s
    models[0].key = "attuale"
    backtests = backtest_models(models, results, start=start)
    if "attuale" not in backtests:
        return None
    cur = backtests["attuale"]
    result = AutotuneResult(Trial(current, cur.log_loss, cur.brier, cur.matches))
    for key, bt in backtests.items():
        if key != "attuale":
            result.trials.append(Trial(keys[key], bt.log_loss, bt.brier, bt.matches))
    best = min(result.trials, key=lambda t: (t.log_loss, t.brier), default=None)
    if best is not None and best.log_loss < cur.log_loss - margin:
        result.best = best
    return result
