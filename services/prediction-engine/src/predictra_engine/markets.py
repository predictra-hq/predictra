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


# Tarature per mercato (ADR 0053, aggiornate dall'ADR 0058): su «entrambe segnano» e sui
# gol totali 1,5 e 2,5 la matrice dei risultati è troppo sicura. La taratura
# σ(a·logit p + b) è stimata sulle stagioni vecchie e verificata sulle recenti (e
# viceversa) e migliora il Log Loss nei due versi:
# - entrambe segnano: 0,6870 → 0,6844 (2024-25) e 0,6897 → 0,6870 (2025-26), ADR 0053;
# - over 1,5 (8.616 partite reali, 17/11/2026): 0,5171 → 0,5143 e 0,5320 → 0,5261;
# - over 2,5 (stesse partite):                  0,6745 → 0,6730 e 0,6879 → 0,6810.
# Sulla linea 3,5 il guadagno c'è in un verso solo: resta quella della matrice.
BTTS_SLOPE = 0.6
BTTS_SHIFT = 0.05
OVER_15_SLOPE = 0.6
OVER_15_SHIFT = 0.55
OVER_25_SLOPE = 0.6
OVER_25_SHIFT = 0.15
TOTAL_CALIBRATION: dict[float, tuple[float, float]] = {
    1.5: (OVER_15_SLOPE, OVER_15_SHIFT),
    2.5: (OVER_25_SLOPE, OVER_25_SHIFT),
}


def _calibrate(p: float, slope: float, shift: float) -> float:
    p = min(max(p, 1e-9), 1 - 1e-9)
    z = slope * float(np.log(p / (1 - p))) + shift
    return float(1 / (1 + np.exp(-z)))


def calibrate_btts(p: float) -> float:
    """Probabilità di «entrambe segnano» tarata: più vicina al 50% di quella della matrice."""
    return _calibrate(p, BTTS_SLOPE, BTTS_SHIFT)


def calibrate_over_15(p: float) -> float:
    """Probabilità di over 1,5 tarata: meno estrema di quella della matrice."""
    return _calibrate(p, OVER_15_SLOPE, OVER_15_SHIFT)


def total_overs(total: np.ndarray) -> dict[float, float]:
    """Probabilità dell'over sulle linee x,5, tarate e coerenti tra loro.

    Le linee tarate (``TOTAL_CALIBRATION``) passano per σ(a·logit p + b); poi, salendo di
    linea, l'over non può crescere (più gol richiesti, meno probabile).
    """
    values = np.arange(len(total))
    overs: dict[float, float] = {}
    previous = 1.0
    for line in sorted({x for x in TOTAL_LINES if not float(x).is_integer()}):
        p = float(total[values > line].sum())
        if line in TOTAL_CALIBRATION:
            p = _calibrate(p, *TOTAL_CALIBRATION[line])
        p = min(p, previous)
        overs[line] = p
        previous = p
    return overs


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
    overs = total_overs(total)
    for line in TOTAL_LINES:
        if float(line).is_integer():
            # Linee intere: vince sopra la linea, perde sotto, rimborso esattamente sulla
            # linea; derivate dalle linee x,5 vicine, così restano coerenti con quelle.
            over = overs.get(line + 0.5, 0.0)
            under = 1 - overs.get(line - 0.5, 1.0)
            push: float | None = max(0.0, 1 - over - under)
        else:
            over, push = overs[line], None
            under = 1 - over
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
