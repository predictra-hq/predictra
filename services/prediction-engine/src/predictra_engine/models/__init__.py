"""Modelli della v1 (ADR 0021)."""

from .base import FittedModel, Model
from .baseline import Baseline
from .blend import dixon_coles_model
from .elo import Elo
from .goals import poisson_model


def all_models() -> list[Model]:
    """Baseline per prima: serve da riferimento per i backtest.

    Baseline ed Elo sono strumenti interni (riferimento e secondo parere); il modello
    PREDICTRA è uno solo, Dixon-Coles combinato con l'Elo (ADR 0039).
    """
    return [Baseline(), Elo(), dixon_coles_model()]


__all__ = [
    "Baseline",
    "Elo",
    "FittedModel",
    "Model",
    "all_models",
    "dixon_coles_model",
    "poisson_model",
]
