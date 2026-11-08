"""Modelli della v1 (ADR 0021)."""

from .base import FittedModel, Model
from .baseline import Baseline
from .elo import Elo
from .goals import dixon_coles_model, poisson_model


def all_models() -> list[Model]:
    """Baseline per prima: serve da riferimento per i backtest."""
    return [Baseline(), Elo(), poisson_model(), dixon_coles_model()]


__all__ = [
    "Baseline",
    "Elo",
    "FittedModel",
    "Model",
    "all_models",
    "dixon_coles_model",
    "poisson_model",
]
