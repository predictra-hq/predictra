from datetime import UTC, datetime

import numpy as np

from predictra_engine.data import MatchResult
from predictra_engine.reliability import Reliability, settle


def result(h, a, when=datetime(2025, 10, 4, 15, tzinfo=UTC), comp=1):
    return MatchResult(1, comp, when, 10, 20, h, a)


def test_esiti_come_la_web_app():
    assert settle("1X2", None, "HOME", 2, 1) is True
    assert settle("DOUBLE_CHANCE", None, "DRAW_AWAY", 1, 1) is True
    assert settle("DOUBLE_CHANCE", None, "HOME_AWAY", 1, 1) is False
    assert settle("TOTAL_GOALS", 2.5, "UNDER", 1, 1) is True
    assert settle("TOTAL_GOALS", 1.5, "OVER", 1, 1) is True
    assert settle("BTTS", None, "NO", 0, 3) is True


def test_riepilogo_della_verifica_storica():
    # Matrice concentrata sull'1-0: favorita casa, under 2,5, gol/no gol "no".
    m = np.full((11, 11), 1e-6)
    m[1, 0] = 0.6
    m[0, 0] = 0.2
    m[2, 0] = 0.15
    m /= m.sum()
    rel = Reliability()
    rel.add(result(1, 0), m, np.array([0.75, 0.2, 0.05]))
    rel.add(result(0, 2), m, np.array([0.75, 0.2, 0.05]))
    out = rel.to_json()
    assert out["matches"] == 2
    assert out["favourite"] == {"count": 2, "wins": 1, "predicted": 1.5}
    assert out["exact_score"]["count"] == 2 and out["exact_score"]["wins"] == 1
    markets = {t["market"]: t for t in out["markets"]}
    # Under 2,5 dato al 95% circa: uscito in entrambe (1-0 e 0-2).
    assert markets["TOTAL_GOALS:2.5"]["wins"] == 2
    assert markets["BTTS"]["count"] == 2
    assert out["seasons"][0]["season"] == "2025/26"
    assert out["weeks"][0]["week"] == "2025-09-29"
    assert all(b["to"] > b["from"] for b in out["bands"])
