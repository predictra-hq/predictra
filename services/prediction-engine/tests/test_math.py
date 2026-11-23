import math

import numpy as np
import pytest

from predictra_engine.confidence import confidence
from predictra_engine.markets import derive_markets, outcome_probabilities
from predictra_engine.metrics import brier, calibration, log_loss
from predictra_engine.models.goals import score_matrix


def by_key(prices):
    out = {}
    for p in prices:
        out.setdefault((p.market, p.line), []).append(p)
    return out


def test_matrice_normalizzata_e_correzione_rho():
    m0 = score_matrix(1.5, 1.1)
    m1 = score_matrix(1.5, 1.1, rho=-0.1)
    assert m0.sum() == pytest.approx(1)
    assert m1.sum() == pytest.approx(1)
    # ρ < 0 aumenta 0-0 e 1-1 rispetto a Poisson indipendente.
    assert m1[0, 0] > m0[0, 0]
    assert m1[1, 1] > m0[1, 1]


def test_ogni_mercato_somma_a_uno_con_il_push():
    prices = derive_markets(score_matrix(1.6, 1.0, rho=-0.05))
    groups = by_key(prices)
    for (market, line), ps in groups.items():
        if market == "DOUBLE_CHANCE":
            assert sum(p.probability for p in ps) == pytest.approx(2)
            continue
        if market == "TEAM_GOALS":
            for side in ("HOME", "AWAY"):
                sel = [p for p in ps if p.selection.startswith(side)]
                assert sum(p.probability for p in sel) == pytest.approx(1)
            continue
        push = ps[0].push or 0
        total = sum(p.probability for p in ps) + (push if market != "DNB" else 0)
        if market == "DNB":
            total = ps[0].probability + ps[1].probability + push
        assert total == pytest.approx(1, abs=1e-9), (market, line)


def test_dnb_e_asiatico_zero_coincidono():
    groups = by_key(derive_markets(score_matrix(1.4, 1.2)))
    dnb = {p.selection: p for p in groups[("DNB", None)]}
    ah0 = {p.selection: p for p in groups[("ASIAN_HANDICAP", 0.0)]}
    assert dnb["HOME"].probability == pytest.approx(ah0["HOME"].probability)
    assert dnb["HOME"].push == pytest.approx(ah0["HOME"].push)


def test_handicap_europeo_meno_uno():
    m = score_matrix(1.4, 1.2)
    groups = by_key(derive_markets(m))
    eh = {p.selection: p.probability for p in groups[("EUROPEAN_HANDICAP", -1.0)]}
    hg, ag = np.indices(m.shape)
    assert eh["HOME"] == pytest.approx(m[hg - ag >= 2].sum())
    assert eh["DRAW"] == pytest.approx(m[hg - ag == 1].sum())


def test_metriche_calcolate_a_mano():
    # Previsione certa e corretta: Brier 0, Log Loss ≈ 0.
    assert brier(np.array([[1.0, 0, 0]]), np.array([0])) == pytest.approx(0)
    # (0,5; 0,25; 0,25) con esito pareggio: Brier = 0,25 + 0,5625 + 0,0625 = 0,875; LL = −ln 0,25.
    p = np.array([[0.5, 0.25, 0.25]])
    assert brier(p, np.array([1])) == pytest.approx(0.875)
    assert log_loss(p, np.array([1])) == pytest.approx(math.log(4))
    ece, curve = calibration(np.array([[0.5, 0.25, 0.25]] * 4), np.array([0, 0, 1, 2]))
    assert ece == pytest.approx(0)  # 50% → 2/4 casa, 25% → 1/4 pareggio e 1/4 ospite
    assert sum(b["count"] for b in curve) == 12


def test_confidence_score_calcolato_a_mano():
    c = confidence(
        games=10,  # 10/20 = 0,5
        ece=0.04,  # 1 − 0,04/0,10 = 0,6
        own=np.array([0.5, 0.3, 0.2]),
        others=[np.array([0.4, 0.3, 0.3])],  # distanza media 0,0667 → 1 − 0,333 = 0,6667
        quality="OK",
        freshness="STALE",  # 0,5
    )
    expected = 0.30 * 0.5 + 0.25 * 0.6 + 0.25 * (1 - (0.2 / 3) / 0.2) + 0.20 * 0.5
    assert c.score == pytest.approx(expected, abs=1e-4)
    assert confidence(
        games=0, ece=None, own=np.ones(3) / 3, others=[], quality="ERROR", freshness="FRESH"
    ).score == pytest.approx(0.25 * 0.5)


def test_esiti_dalla_matrice():
    m = np.zeros((3, 3))
    m[1, 0], m[1, 1], m[0, 2] = 0.5, 0.3, 0.2
    assert outcome_probabilities(m) == pytest.approx([0.5, 0.3, 0.2])


def test_btts_tarato_verso_il_50_per_cento():
    """ADR 0053: stessa direzione della matrice, meno sicurezza; Sì e No sommano a 1."""
    from predictra_engine.markets import calibrate_btts

    assert 0.5 < calibrate_btts(0.7) < 0.7
    assert 0.3 < calibrate_btts(0.3) < 0.5
    assert calibrate_btts(0.6) > calibrate_btts(0.5) > calibrate_btts(0.4)
    m = score_matrix(1.6, 1.0, rho=-0.05)
    groups = {(p.market, p.selection): p.probability for p in derive_markets(m)}
    yes, no = groups[("BTTS", "YES")], groups[("BTTS", "NO")]
    assert abs(yes + no - 1) < 1e-12
    assert abs(yes - calibrate_btts(float(m[1:, 1:].sum()))) < 1e-12


def test_over_15_tarato_e_coerente_con_le_altre_linee():
    """ADR 0053: over 1,5 meno estremo, under complementare, mai sotto l'over 2,5."""
    from predictra_engine.markets import calibrate_over_15

    assert calibrate_over_15(0.9) < 0.9
    assert calibrate_over_15(0.6) > 0.6
    for home, away in ((1.6, 1.0), (0.4, 0.3), (3.2, 2.4)):
        prices = {
            (p.market, p.line, p.selection): p.probability
            for p in derive_markets(score_matrix(home, away, rho=-0.05))
        }
        over, under = prices[("TOTAL_GOALS", 1.5, "OVER")], prices[("TOTAL_GOALS", 1.5, "UNDER")]
        assert abs(over + under - 1) < 1e-12
        assert prices[("TOTAL_GOALS", 0.5, "OVER")] >= over >= prices[("TOTAL_GOALS", 2.5, "OVER")]


def test_gol_totali_tarati_e_coerenti_su_tutte_le_linee():
    """ADR 0060: 1,5 e 2,5 tarati; l'over scende salendo di linea; linee intere coerenti."""
    from predictra_engine.markets import TOTAL_LINES

    for home, away in ((1.6, 1.0), (0.4, 0.3), (3.2, 2.4), (2.8, 0.2)):
        prices = {
            (p.market, p.line, p.selection): (p.probability, p.push)
            for p in derive_markets(score_matrix(home, away, rho=-0.05))
        }
        halves = [x for x in TOTAL_LINES if not float(x).is_integer()]
        overs = [prices[("TOTAL_GOALS", x, "OVER")][0] for x in halves]
        assert overs == sorted(overs, reverse=True)
        for line in TOTAL_LINES:
            over, push = prices[("TOTAL_GOALS", line, "OVER")]
            under, _ = prices[("TOTAL_GOALS", line, "UNDER")]
            assert abs(over + under + (push or 0) - 1) < 1e-9
            assert push is None or push >= 0
        # Linea 2: vince con 3 gol o più, come l'over 2,5.
        assert prices[("TOTAL_GOALS", 2.0, "OVER")][0] == prices[("TOTAL_GOALS", 2.5, "OVER")][0]


def test_over_25_meno_estremo_della_matrice():
    from predictra_engine.markets import OVER_25_SHIFT, OVER_25_SLOPE, _calibrate

    assert _calibrate(0.2, OVER_25_SLOPE, OVER_25_SHIFT) > 0.2
    assert _calibrate(0.85, OVER_25_SLOPE, OVER_25_SHIFT) < 0.85


def test_under_35_meno_sicuro_della_matrice():
    """ADR 0063: l'under 3,5 della matrice era troppo sicuro; tarato scende."""
    from predictra_engine.markets import OVER_35_SHIFT, OVER_35_SLOPE, _calibrate

    over = 0.22  # under 3,5 al 78% secondo la matrice
    assert 1 - _calibrate(over, OVER_35_SLOPE, OVER_35_SHIFT) < 0.75
