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
