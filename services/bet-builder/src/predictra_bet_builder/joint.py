"""Probabilità congiunta di più selezioni sulla stessa partita (ADR 0026 §1).

``matrix[h][a]`` è la probabilità del risultato h-a (``prediction_score_matrices``).
La congiunta è la somma delle celle in cui **tutte** le selezioni vincono.

In v1 queste combinazioni non diventano proposte (manca la quota reale della
combinazione): la funzione serve ai test di coerenza e come riferimento per la
valutazione manuale (M5 corsia B).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

TAIL_TOLERANCE = 0.001
EPS = 1e-12


class NotModellable(ValueError):
    """Combinazione non modellabile: va esclusa (ADR 0026 §3)."""


@dataclass(frozen=True)
class Selection:
    market: str
    line: float | None
    selection: str


def _over_under(goals: int, line: float, side: str) -> bool | None:
    if goals == line:
        return None  # rimborso
    return goals > line if side == "OVER" else goals < line


def outcome(sel: Selection, h: int, a: int) -> bool | None:
    """Esito della selezione con il risultato h-a: vinta, persa o ``None`` (rimborso)."""
    m, line, s = sel.market, sel.line, sel.selection
    if m == "1X2":
        return {"HOME": h > a, "DRAW": h == a, "AWAY": h < a}[s]
    if m == "DOUBLE_CHANCE":
        return {"HOME_DRAW": h >= a, "HOME_AWAY": h != a, "DRAW_AWAY": h <= a}[s]
    if m == "DNB":
        if h == a:
            return None
        return h > a if s == "HOME" else h < a
    if m == "BTTS":
        both = h > 0 and a > 0
        return both if s == "YES" else not both
    if m == "TOTAL_GOALS":
        assert line is not None
        return _over_under(h + a, line, s)
    if m == "TEAM_GOALS":
        assert line is not None
        team, side = s.split("_")
        return _over_under(h if team == "HOME" else a, line, side)
    if m == "CORRECT_SCORE":
        if s == "OTHER":
            raise NotModellable("CORRECT_SCORE OTHER dipende dai risultati elencati")
        hs, as_ = (int(x) for x in s.split("-"))
        return h == hs and a == as_
    if m == "EUROPEAN_HANDICAP":
        assert line is not None
        adj = h - a + line
        return {"HOME": adj > 0, "DRAW": adj == 0, "AWAY": adj < 0}[s]
    if m == "ASIAN_HANDICAP":
        assert line is not None
        adj = h - a + line
        if adj == 0:
            return None
        return adj > 0 if s == "HOME" else adj < 0
    raise NotModellable(f"Mercato {m} non valutabile")


def _probability(matrix: Sequence[Sequence[float]], sels: Sequence[Selection]) -> float:
    total = 0.0
    for h, row in enumerate(matrix):
        for a, p in enumerate(row):
            if all(outcome(s, h, a) is True for s in sels):
                total += p
    return total


def joint_probability(matrix: Sequence[Sequence[float]], sels: Sequence[Selection]) -> float:
    """Probabilità che vincano tutte le selezioni; ``NotModellable`` se va esclusa."""
    if len(sels) < 2:
        raise NotModellable("Servono almeno due selezioni")
    if len({(s.market, s.line, s.selection) for s in sels}) != len(sels):
        raise NotModellable("Selezioni ripetute")
    mass = sum(sum(row) for row in matrix)
    if 1 - mass > TAIL_TOLERANCE:
        raise NotModellable("Massa fuori matrice non trascurabile")
    for h, row in enumerate(matrix):
        for a, _ in enumerate(row):
            if any(outcome(s, h, a) is None for s in sels):
                raise NotModellable("Selezione con rimborso")
    joint = _probability(matrix, sels)
    if joint <= EPS:
        raise NotModellable("Selezioni incompatibili")
    if any(abs(joint - _probability(matrix, [s])) <= EPS for s in sels):
        raise NotModellable("Selezioni ridondanti")
    return joint
