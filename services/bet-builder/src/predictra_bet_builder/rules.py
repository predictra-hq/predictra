"""Regole e formule di riferimento (ADR 0025, 0027).

Replicano `packages/shared-types/src/bet-builder.ts` con gli stessi casi di test
(`tests/test_rules.py` e `packages/shared-types/src/bet-builder.test.ts`).
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Rules:
    # ADR 0065: meno proposte e più solide (erano 8 per categoria, selezioni dal 20%).
    # ADR 0073: peso del mercato 0,75 (era 0,5).
    rules_version: str = "2026.11.25-1"
    max_legs: int = 4
    max_proposals_per_category: int = 2
    min_leg_probability: float = 0.35
    min_probability: float = 0.15
    min_leg_expected_value: float = 0.02
    min_expected_value: float = 0.05
    min_confidence_score: float = 0.4
    # ADR 0028: probabilità usata = (1 − w)·modello + w·mercato; quote solo italiane.
    market_weight: float = 0.75
    italian_bookmakers_only: bool = True

    def as_json(self) -> dict[str, object]:
        return asdict(self)


DEFAULT_RULES = Rules()

CATEGORIES = ("CONSERVATIVE", "BALANCED", "AGGRESSIVE")
CATEGORY_MIN_PROBABILITY = {"CONSERVATIVE": 0.5, "BALANCED": 0.25, "AGGRESSIVE": 0.0}


def blended_probability(model: float, market: float, weight: float) -> float:
    """Probabilità usata (ADR 0028): ``(1 − w)·modello + w·mercato``."""
    return (1 - weight) * model + weight * market


def expected_value(probability: float, price: float) -> float:
    """Valore atteso per unità puntata: ``p · quota − 1``."""
    return probability * price - 1


def independent_probability(probabilities: Iterable[float]) -> float:
    """Multipla su partite diverse: indipendenza dichiarata (ADR 0026 §2)."""
    return math.prod(probabilities)


def category_for_probability(probability: float) -> str:
    if probability >= CATEGORY_MIN_PROBABILITY["CONSERVATIVE"]:
        return "CONSERVATIVE"
    if probability >= CATEGORY_MIN_PROBABILITY["BALANCED"]:
        return "BALANCED"
    return "AGGRESSIVE"


def rank_score(probability: float, price: float, confidence: float) -> float:
    """``C · EV / σ`` con ``σ = quota · √(p(1 − p))`` (ADR 0027 §2)."""
    if not (0 < probability < 1) or not price > 1:
        raise ValueError("Probabilità in (0, 1) e quota > 1")
    sigma = price * math.sqrt(probability * (1 - probability))
    return confidence * expected_value(probability, price) / sigma
