from datetime import UTC, datetime

import numpy as np
import pytest

from predictra_engine.market import compare, consensus

KO = datetime(2026, 11, 10, 20, tzinfo=UTC)


def quote(book, sel, price, when="2026-11-10T10:00:00+00:00", match=1):
    return {
        "match_id": match,
        "bookmaker": book,
        "selection": sel,
        "price": price,
        "observed_at": when,
    }


def test_consenso_senza_margine_e_solo_prima_del_via():
    odds = [
        quote("a", "HOME", 2.0),
        quote("a", "DRAW", 4.0),
        quote("a", "AWAY", 4.0),
        quote("b", "HOME", 1.5, "2026-11-10T21:00:00+00:00"),
        quote("b", "DRAW", 5.0, "2026-11-10T21:00:00+00:00"),
        quote("b", "AWAY", 6.0, "2026-11-10T21:00:00+00:00"),
    ]
    p = consensus(odds, {1: KO})[1]
    assert p.sum() == pytest.approx(1)
    assert p[0] == pytest.approx(0.5)


def test_confronto_dei_pesi():
    lines = compare({1: np.array([0.5, 0.3, 0.2])}, {1: np.array([0.6, 0.25, 0.15])}, {1: 0})
    assert lines[0] == "  partite 1"
    assert any("peso mercato 0.5" in line for line in lines)
