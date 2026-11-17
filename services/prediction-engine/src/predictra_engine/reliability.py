"""Verifica storica del modello su tutti i mercati principali (ADR 0057).

Durante il backtest walk-forward (ogni settimana il modello vede solo le partite
precedenti) si raccolgono, per ogni partita rigiocata, le probabilità di tutti i mercati
principali e si confrontano con il risultato vero. Il riepilogo finisce in
``backtests.reliability`` e la pagina Affidabilità lo mostra: migliaia di partite invece
delle poche giocate delle ultime settimane.

Solo probabilità del modello: per le stagioni passate non ci sono quote raccolte.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .data import MatchResult
from .markets import derive_markets, markets_1x2

# Gruppi di mercato mostrati: in ognuno si guarda l'esito più probabile.
GROUPS: tuple[tuple[str, float | None], ...] = (
    ("1X2", None),
    ("DOUBLE_CHANCE", None),
    ("TOTAL_GOALS", 1.5),
    ("TOTAL_GOALS", 2.5),
    ("TOTAL_GOALS", 3.5),
    ("BTTS", None),
)
# Soglia delle "giocate": come la pagina Certezze, dal 70%.
PICK_THRESHOLD = 0.7
BANDS = (0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9)
RECENT_WEEKS = 26


def settle(market: str, line: float | None, selection: str, home: int, away: int) -> bool | None:
    """Esito di una selezione al 90' (come ``settle`` della web app)."""
    outcome = "HOME" if home > away else "DRAW" if home == away else "AWAY"
    if market == "1X2":
        return selection == outcome
    if market == "DOUBLE_CHANCE":
        parts = {"HOME_DRAW": ("HOME", "DRAW"), "HOME_AWAY": ("HOME", "AWAY")}
        return outcome in parts.get(selection, ("DRAW", "AWAY"))
    if market == "BTTS":
        both = home > 0 and away > 0
        return both if selection == "YES" else not both
    if market == "TOTAL_GOALS" and line is not None:
        goals = home + away
        if goals == line:
            return None
        return goals > line if selection == "OVER" else goals < line
    return None


@dataclass
class Tally:
    count: int = 0
    wins: int = 0
    predicted: float = 0.0

    def add(self, p: float, won: bool) -> None:
        self.count += 1
        self.wins += int(won)
        self.predicted += p

    def to_json(self) -> dict[str, Any]:
        return {"count": self.count, "wins": self.wins, "predicted": round(self.predicted, 4)}


@dataclass
class Reliability:
    """Accumulatore: si alimenta partita per partita durante il walk-forward."""

    matches: int = 0
    favourite: Tally = field(default_factory=Tally)
    exact: Tally = field(default_factory=Tally)
    picks: Tally = field(default_factory=Tally)
    bands: dict[float, Tally] = field(default_factory=dict)
    markets: dict[str, Tally] = field(default_factory=dict)
    competitions: dict[int, Tally] = field(default_factory=dict)
    seasons: dict[str, Tally] = field(default_factory=dict)
    weeks: dict[str, Tally] = field(default_factory=dict)

    def add(self, result: MatchResult, matrix: np.ndarray | None, p1x2: np.ndarray) -> None:
        prices = derive_markets(matrix) if matrix is not None else markets_1x2(p1x2)
        h, a = result.home_goals, result.away_goals
        self.matches += 1
        fav = int(np.argmax(p1x2))
        self.favourite.add(float(p1x2[fav]), fav == result.outcome)
        if matrix is not None:
            i, j = np.unravel_index(int(np.argmax(matrix)), matrix.shape)
            self.exact.add(float(matrix[i, j]), (int(i), int(j)) == (h, a))
        for market, line in GROUPS:
            options = [p for p in prices if p.market == market and p.line == line]
            if not options:
                continue
            for p in options:
                won = settle(market, line, p.selection, h, a)
                band = max((b for b in BANDS if p.probability >= b), default=None)
                if won is not None and band is not None:
                    self.bands.setdefault(band, Tally()).add(p.probability, won)
            best = max(options, key=lambda p: p.probability)
            won = settle(market, line, best.selection, h, a)
            if won is None or best.probability < PICK_THRESHOLD:
                continue
            key = market if line is None else f"{market}:{line:g}"
            self.picks.add(best.probability, won)
            self.markets.setdefault(key, Tally()).add(best.probability, won)
            self.competitions.setdefault(result.competition_id, Tally()).add(best.probability, won)
            season = _season(result)
            self.seasons.setdefault(season, Tally()).add(best.probability, won)
            week = result.kickoff_at.date().isocalendar()
            monday = result.kickoff_at.date().fromisocalendar(week.year, week.week, 1)
            self.weeks.setdefault(monday.isoformat(), Tally()).add(best.probability, won)

    def to_json(self) -> dict[str, Any]:
        weeks = sorted(self.weeks.items())[-RECENT_WEEKS:]
        return {
            "version": 1,
            "matches": self.matches,
            "threshold": PICK_THRESHOLD,
            "favourite": self.favourite.to_json(),
            "exact_score": self.exact.to_json(),
            "picks": self.picks.to_json(),
            "bands": [
                {"from": b, "to": next((x for x in BANDS if x > b), 1.0), **t.to_json()}
                for b, t in sorted(self.bands.items())
            ],
            "markets": [{"market": k, **t.to_json()} for k, t in sorted(self.markets.items())],
            "competitions": [
                {"competition_id": k, **t.to_json()} for k, t in sorted(self.competitions.items())
            ],
            "seasons": [{"season": k, **t.to_json()} for k, t in sorted(self.seasons.items())],
            "weeks": [{"week": k, **t.to_json()} for k, t in weeks],
        }


def _season(result: MatchResult) -> str:
    """Stagione calcistica: da luglio a giugno (es. "2025/26")."""
    y = result.kickoff_at.year if result.kickoff_at.month >= 7 else result.kickoff_at.year - 1
    return f"{y}/{str(y + 1)[-2:]}"
