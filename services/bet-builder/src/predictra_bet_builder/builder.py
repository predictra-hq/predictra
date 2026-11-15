"""Generazione, filtro e ranking delle combinazioni (ADR 0025, 0026, 0027).

Fasi A2 e A3 del piano M5:
- selezioni ammesse: soglie per selezione (probabilità, Confidence Score, EV);
- combinazioni: singole e multiple su partite e squadre diverse dello stesso turno
  (ADR 0026 §2 e ADR 0036: da venerdì a lunedì o da martedì a giovedì, ora di Roma;
  niente selezioni sulla stessa partita in v1, §1);
- soglie della combinazione, categoria dalla probabilità, ranking ``C · EV / σ``,
  al massimo ``max_proposals_per_category`` proposte per turno e categoria, tra cui
  la migliore di ogni numero di selezioni (singola, doppia, tripla…) che supera le soglie.

I valori sono calcolati come li ricalcola il database (``record_bet_proposals``):
probabilità arrotondata a 8 decimali, quota combinata a 6, EV dai valori arrotondati.
Se nulla supera le soglie il risultato è vuoto: nessuna schedina forzata.
"""

from __future__ import annotations

import itertools
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from .rules import Rules, category_for_probability, expected_value, rank_score

ROME = ZoneInfo("Europe/Rome")
# Selezioni considerate per giornata, le migliori per punteggio: limita le combinazioni.
MAX_CANDIDATE_LEGS = 30


def round_start(day: date) -> date:
    """Inizio del turno (ADR 0036): venerdì per venerdì–lunedì, martedì per martedì–giovedì."""
    weekday = day.weekday()  # lunedì = 0
    if weekday >= 4:
        return day - timedelta(days=weekday - 4)
    if weekday == 0:
        return day - timedelta(days=3)
    return day - timedelta(days=weekday - 1)


def _select(proposals: list[Proposal], limit: int) -> list[Proposal]:
    """Le ``limit`` migliori per punteggio, garantendo la migliore di ogni numero di
    selezioni presente (ADR 0036): così le multiple non spariscono dietro le singole."""
    ordered = sorted(proposals, key=Proposal.sort_key)
    chosen: list[Proposal] = ordered[:1]
    for size in sorted({len(p.legs) for p in ordered}):
        if len(chosen) >= limit:
            break
        if all(len(p.legs) != size for p in chosen):
            chosen.append(next(p for p in ordered if len(p.legs) == size))
    for p in ordered:
        if len(chosen) >= limit:
            break
        if p not in chosen:
            chosen.append(p)
    return sorted(chosen, key=Proposal.sort_key)


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
    # ADR 0028: `probability` è quella usata (media pesata); qui le due componenti.
    model_probability: Decimal | None = None
    market_probability: Decimal | None = None

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
                        "model_probability": None
                        if leg.model_probability is None
                        else float(leg.model_probability),
                        "market_probability": None
                        if leg.market_probability is None
                        else float(leg.market_probability),
                        "price": float(leg.price),
                        "bookmaker": leg.bookmaker,
                        "expected_value": round(leg.expected_value, 6),
                    }
                    for leg in self.legs
                ],
            },
            "legs": [_leg_ref(leg) for leg in self.legs],
        }


def _leg_ref(leg: Leg) -> dict[str, object]:
    ref: dict[str, object] = {
        "prediction_id": leg.prediction_id,
        "odds_snapshot_id": leg.odds_snapshot_id,
    }
    if leg.market_probability is not None:
        ref["market_probability"] = float(leg.market_probability)
    return ref


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
    by_round: dict[date, list[Leg]] = defaultdict(list)
    for leg in eligible_legs(legs, rules):
        by_round[round_start(leg.slate_date)].append(leg)

    evaluated = 0
    grouped: dict[tuple[date, str], list[Proposal]] = defaultdict(list)
    for start in sorted(by_round):
        pool = sorted(by_round[start], key=lambda leg: (-leg.score(), leg.prediction_id))
        pool = pool[:MAX_CANDIDATE_LEGS]
        for size in range(1, rules.max_legs + 1):
            for combo in itertools.combinations(pool, size):
                if size > 1 and not _independent(combo):
                    continue
                evaluated += 1
                proposal = _combine(combo, rules)
                if proposal is not None:
                    grouped[(start, proposal.category)].append(proposal)

    result: list[Proposal] = []
    for key in sorted(grouped):
        ranked = _select(grouped[key], rules.max_proposals_per_category)
        result.extend(Proposal(**{**p.__dict__, "rank": i}) for i, p in enumerate(ranked, start=1))
    return result, evaluated
