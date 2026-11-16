"""Mercati derivati dalla matrice dei risultati esatti (ADR 0021 §2).

Ogni voce: (mercato, linea, selezione, probabilità di vincita piena, probabilità di push).
Le linee sono dal punto di vista della squadra di casa per gli handicap.
"""

from __future__ import annotations

from typing import NamedTuple

import numpy as np

TOTAL_LINES = (0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.5)
TEAM_LINES = (0.5, 1.5, 2.5)
EUROPEAN_LINES = (-2, -1, 1, 2)
ASIAN_LINES = tuple(x / 2 for x in range(-5, 6))  # da -2,5 a +2,5 a passi di 0,5
CORRECT_SCORE_MAX = 4


class MarketPrice(NamedTuple):
    market: str
    line: float | None
    selection: str
    probability: float
    push: float | None


def outcome_probabilities(m: np.ndarray) -> np.ndarray:
    return np.array([np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()])


def _over_under(dist: np.ndarray, line: float) -> tuple[float, float, float | None]:
    values = np.arange(len(dist))
    over = float(dist[values > line].sum())
    under = float(dist[values < line].sum())
    push = float(dist[values == line].sum()) if float(line).is_integer() else None
    return over, under, push


# Entrambe segnano: la matrice dei risultati è troppo sicura (ADR 0053). Sul banco di
# prova la taratura σ(a·logit p + b) migliora il Log Loss in tutte e due le stagioni di
# verifica e in tutti i campionati: 0,6870 → 0,6844 (2024-25) e 0,6897 → 0,6870 (2025-26).
BTTS_SLOPE = 0.6
BTTS_SHIFT = 0.05


def calibrate_btts(p: float) -> float:
    """Probabilità di «entrambe segnano» tarata: più vicina al 50% di quella della matrice."""
    p = min(max(p, 1e-9), 1 - 1e-9)
    z = BTTS_SLOPE * float(np.log(p / (1 - p))) + BTTS_SHIFT
    return float(1 / (1 + np.exp(-z)))


def derive_markets(m: np.ndarray) -> list[MarketPrice]:
    h, d, a = (float(x) for x in outcome_probabilities(m))
    out = [
        MarketPrice("1X2", None, "HOME", h, None),
        MarketPrice("1X2", None, "DRAW", d, None),
        MarketPrice("1X2", None, "AWAY", a, None),
        MarketPrice("DOUBLE_CHANCE", None, "HOME_DRAW", h + d, None),
        MarketPrice("DOUBLE_CHANCE", None, "HOME_AWAY", h + a, None),
        MarketPrice("DOUBLE_CHANCE", None, "DRAW_AWAY", d + a, None),
        MarketPrice("DNB", None, "HOME", h, d),
        MarketPrice("DNB", None, "AWAY", a, d),
    ]

    n = m.shape[0]
    hg, ag = np.indices(m.shape)
    total = np.bincount((hg + ag).ravel(), weights=m.ravel(), minlength=2 * n - 1)
    for line in TOTAL_LINES:
        over, under, push = _over_under(total, line)
        out += [
            MarketPrice("TOTAL_GOALS", line, "OVER", over, push),
            MarketPrice("TOTAL_GOALS", line, "UNDER", under, push),
        ]

    btts = calibrate_btts(float(m[1:, 1:].sum()))
    out += [
        MarketPrice("BTTS", None, "YES", btts, None),
        MarketPrice("BTTS", None, "NO", 1 - btts, None),
    ]

    home_dist, away_dist = m.sum(axis=1), m.sum(axis=0)
    for line in TEAM_LINES:
        ho, hu, _ = _over_under(home_dist, line)
        ao, au, _ = _over_under(away_dist, line)
        out += [
            MarketPrice("TEAM_GOALS", line, "HOME_OVER", ho, None),
            MarketPrice("TEAM_GOALS", line, "HOME_UNDER", hu, None),
            MarketPrice("TEAM_GOALS", line, "AWAY_OVER", ao, None),
            MarketPrice("TEAM_GOALS", line, "AWAY_UNDER", au, None),
        ]

    listed = 0.0
    for i in range(CORRECT_SCORE_MAX + 1):
        for j in range(CORRECT_SCORE_MAX + 1):
            p = float(m[i, j])
            listed += p
            out.append(MarketPrice("CORRECT_SCORE", None, f"{i}-{j}", p, None))
    out.append(MarketPrice("CORRECT_SCORE", None, "OTHER", max(0.0, 1 - listed), None))

    margin = hg - ag
    for line in EUROPEAN_LINES:
        adj = margin + line
        out += [
            MarketPrice("EUROPEAN_HANDICAP", float(line), "HOME", float(m[adj > 0].sum()), None),
            MarketPrice("EUROPEAN_HANDICAP", float(line), "DRAW", float(m[adj == 0].sum()), None),
            MarketPrice("EUROPEAN_HANDICAP", float(line), "AWAY", float(m[adj < 0].sum()), None),
        ]

    for line in ASIAN_LINES:
        adj = margin + line
        push = float(m[adj == 0].sum()) if float(line).is_integer() else None
        out += [
            MarketPrice("ASIAN_HANDICAP", line, "HOME", float(m[adj > 0].sum()), push),
            MarketPrice("ASIAN_HANDICAP", line, "AWAY", float(m[adj < 0].sum()), push),
        ]
    return out


def markets_1x2(p: np.ndarray) -> list[MarketPrice]:
    """Per i modelli senza matrice (baseline, Elo) si salva solo l'1X2."""
    return [
        MarketPrice("1X2", None, sel, float(x), None)
        for sel, x in zip(("HOME", "DRAW", "AWAY"), p, strict=True)
    ]
