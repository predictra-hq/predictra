"""Generazione, filtro e ranking delle combinazioni (ADR 0025, 0026, 0027).

Fasi A2 e A3 del piano M5:
- selezioni ammesse: soglie per selezione (probabilità, Confidence Score, EV);
- combinazioni: singole e multiple su partite e squadre diverse della stessa
  giornata (ADR 0026 §2; niente selezioni sulla stessa partita in v1, §1);
- soglie della combinazione, categoria dalla probabilità, ranking ``C · EV / σ``,
  al massimo ``max_proposals_per_category`` proposte per giornata e categoria.

I valori sono calcolati come li ricalcola il database (``record_bet_proposals``):
probabilità arrotondata a 8 decimali, quota combinata a 6, EV dai valori arrotondati.
Se nulla supera le soglie il risultato è vuoto: nessuna schedina forzata.
"""

from __future__ import annotations

import itertools
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from .rules import Rules, category_for_probability, expected_value, rank_score

ROME = ZoneInfo("Europe/Rome")
# Selezioni considerate per giornata, le migliori per punteggio: limita le combinazioni.
MAX_CANDIDATE_LEGS = 30


@dataclass(frozen=True)
class Leg:
    """Una previsione del modello attivo con la migliore quota reale ammessa."""

    prediction_id: int
    match_id: int
    kickoff_at: datetime
    home_team_id: int
    away_team_id: int
    market: str
    line: float | None
    selection: str
    probability: Decimal
    confidence: Decimal
    odds_snapshot_id: int
    bookmaker: str
    price: Decimal

    @property
    def expected_value(self) -> float:
        return expected_value(float(self.probability), float(self.price))

    @property
    def slate_date(self) -> date:
        return self.kickoff_at.astimezone(ROME).date()

    def score(self) -> float:
        return rank_score(float(self.probability), float(self.price), float(self.confidence))


@dataclass(frozen=True)
class Proposal:
    slate_date: date
    category: str
    legs: tuple[Leg, ...]
    probability: Decimal
    combined_price: Decimal
    expected_value: Decimal
    confidence: Decimal
    rank_score: float
    rank: int = 0

    def sort_key(self) -> tuple[float, Decimal, int, tuple[int, ...]]:
        return (
            -self.rank_score,
            -self.probability,
            len(self.legs),
            tuple(sorted(leg.prediction_id for leg in self.legs)),
        )

    def as_batch_item(self, rules: Rules) -> dict[str, object]:
        return {
            "category": self.category,
            "rank": self.rank,
            "rank_score": round(self.rank_score, 6),
            "explanation": {
                "correlation": "independence" if len(self.legs) > 1 else "none",
                "rules_version": rules.rules_version,
                "ranking": "C·EV/σ",
                "legs": [
                    {
                        "match_id": leg.match_id,
                        "selection": leg.selection,
                        "probability": float(leg.probability),
                        "price": float(leg.price),
                        "bookmaker": leg.bookmaker,
                        "expected_value": round(leg.expected_value, 6),
                    }
                    for leg in self.legs
                ],
            },
            "legs": [
                {"prediction_id": leg.prediction_id, "odds_snapshot_id": leg.odds_snapshot_id}
                for leg in self.legs
            ],
        }


def _round(value: Decimal, places: int) -> Decimal:
    return value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)


def eligible_legs(legs: list[Leg], rules: Rules) -> list[Leg]:
    return [
        leg
        for leg in legs
        if float(leg.probability) >= rules.min_leg_probability
        and float(leg.confidence) >= rules.min_confidence_score
        and leg.expected_value >= rules.min_leg_expected_value
        and 0 < leg.probability < 1
    ]


def _combine(legs: tuple[Leg, ...], rules: Rules) -> Proposal | None:
    probability = Decimal(1)
    price = Decimal(1)
    for leg in legs:
        probability *= leg.probability
        price *= leg.price
    probability = _round(probability, 8)
    price = _round(price, 6)
    ev = _round(probability * price - 1, 6)
    confidence = min(leg.confidence for leg in legs)
    if (
        float(probability) < rules.min_probability
        or float(ev) < rules.min_expected_value
        or float(confidence) < rules.min_confidence_score
        or not 0 < probability < 1
    ):
        return None
    first = min(legs, key=lambda leg: leg.kickoff_at)
    return Proposal(
        slate_date=first.slate_date,
        category=category_for_probability(float(probability)),
        legs=tuple(sorted(legs, key=lambda leg: (leg.kickoff_at, leg.match_id))),
        probability=probability,
        combined_price=price,
        expected_value=ev,
        confidence=confidence,
        rank_score=rank_score(float(probability), float(price), float(confidence)),
    )


def _independent(legs: tuple[Leg, ...]) -> bool:
    """Partite e squadre tutte diverse (ADR 0026 §1–2)."""
    matches = {leg.match_id for leg in legs}
    teams = [t for leg in legs for t in (leg.home_team_id, leg.away_team_id)]
    return len(matches) == len(legs) and len(set(teams)) == len(teams)


def build_proposals(legs: list[Leg], rules: Rules) -> tuple[list[Proposal], int]:
    """Proposte ordinate e numerate; secondo valore: combinazioni valutate."""
    by_slate: dict[date, list[Leg]] = defaultdict(list)
    for leg in eligible_legs(legs, rules):
        by_slate[leg.slate_date].append(leg)

    evaluated = 0
    grouped: dict[tuple[date, str], list[Proposal]] = defaultdict(list)
    for slate in sorted(by_slate):
        pool = sorted(by_slate[slate], key=lambda leg: (-leg.score(), leg.prediction_id))
        pool = pool[:MAX_CANDIDATE_LEGS]
        for size in range(1, rules.max_legs + 1):
            for combo in itertools.combinations(pool, size):
                if size > 1 and not _independent(combo):
                    continue
                evaluated += 1
                proposal = _combine(combo, rules)
                if proposal is not None:
                    grouped[(proposal.slate_date, proposal.category)].append(proposal)

    result: list[Proposal] = []
    for key in sorted(grouped):
        ranked = sorted(grouped[key], key=Proposal.sort_key)[: rules.max_proposals_per_category]
        result.extend(Proposal(**{**p.__dict__, "rank": i}) for i, p in enumerate(ranked, start=1))
    return result, evaluated
