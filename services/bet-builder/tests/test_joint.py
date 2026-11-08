"""Fase A1: probabilità congiunta sulla stessa partita, test di coerenza (ADR 0026 §1)."""

import math

import pytest

from predictra_bet_builder.joint import NotModellable, Selection, joint_probability, outcome


def poisson_matrix(lh: float, la: float, n: int = 15, normalize: bool = True) -> list[list[float]]:
    """Matrice DEMO di Poisson indipendenti, normalizzata (massa fuori matrice < 1e-6)."""
    ph = [math.exp(-lh) * lh**k / math.factorial(k) for k in range(n + 1)]
    pa = [math.exp(-la) * la**k / math.factorial(k) for k in range(n + 1)]
    m = [[x * y for y in pa] for x in ph]
    if not normalize:
        return m
    total = sum(map(sum, m))
    return [[v / total for v in row] for row in m]


M = poisson_matrix(1.5, 1.1)


def marginal(sel: Selection) -> float:
    return sum(p for h, row in enumerate(M) for a, p in enumerate(row) if outcome(sel, h, a))


HOME = Selection("1X2", None, "HOME")
OVER = Selection("TOTAL_GOALS", 2.5, "OVER")
BTTS = Selection("BTTS", None, "YES")


def test_case_calcolato_a_mano():
    # Matrice 2×2: 0-0 0,4 · 0-1 0,1 · 1-0 0,3 · 1-1 0,2.
    m = [[0.4, 0.1], [0.3, 0.2]]
    # Casa vince e Goal: nessuna cella (1-0 non è Goal) → incompatibili.
    with pytest.raises(NotModellable, match="incompatibili"):
        joint_probability(m, [HOME, BTTS])
    # Doppia chance 1X e Under 1,5: celle 0-0 e 1-0 = 0,7.
    dc = Selection("DOUBLE_CHANCE", None, "HOME_DRAW")
    under = Selection("TOTAL_GOALS", 1.5, "UNDER")
    assert joint_probability(m, [dc, under]) == pytest.approx(0.7)


def test_correlazione_positiva_casa_over():
    joint = joint_probability(M, [HOME, OVER])
    # Coerenza: tra 0 e il minimo dei marginali, e diversa dal prodotto (correlazione).
    assert 0 < joint < min(marginal(HOME), marginal(OVER))
    assert joint > marginal(HOME) * marginal(OVER)


def test_scomposizione_completa():
    # P(casa ∧ over) + P(casa ∧ under) = P(casa).
    under = Selection("TOTAL_GOALS", 2.5, "UNDER")
    total = joint_probability(M, [HOME, OVER]) + joint_probability(M, [HOME, under])
    assert total == pytest.approx(marginal(HOME))


def test_esclusioni():
    with pytest.raises(NotModellable, match="incompatibili"):
        joint_probability(M, [HOME, Selection("1X2", None, "AWAY")])
    with pytest.raises(NotModellable, match="ridondanti"):
        joint_probability(M, [HOME, Selection("DOUBLE_CHANCE", None, "HOME_DRAW")])
    with pytest.raises(NotModellable, match="rimborso"):
        joint_probability(M, [HOME, Selection("TOTAL_GOALS", 2.0, "OVER")])
    with pytest.raises(NotModellable, match="rimborso"):
        joint_probability(M, [OVER, Selection("DNB", None, "HOME")])
    with pytest.raises(NotModellable, match="fuori matrice"):
        joint_probability(poisson_matrix(1.5, 1.1, n=3, normalize=False), [HOME, OVER])
    with pytest.raises(NotModellable, match="ripetute"):
        joint_probability(M, [HOME, HOME])
    with pytest.raises(NotModellable, match="almeno due"):
        joint_probability(M, [HOME])
    with pytest.raises(NotModellable, match="OTHER"):
        joint_probability(M, [HOME, Selection("CORRECT_SCORE", None, "OTHER")])


def test_handicap_e_team_goals():
    eh = Selection("EUROPEAN_HANDICAP", -1.0, "HOME")  # casa vince con 2+ gol di scarto
    team = Selection("TEAM_GOALS", 1.5, "HOME_OVER")
    joint = joint_probability(M, [eh, OVER])
    assert joint == pytest.approx(
        marginal(eh) - joint_probability(M, [eh, Selection("TOTAL_GOALS", 2.5, "UNDER")])
    )
    assert 0 < joint_probability(M, [team, BTTS]) < marginal(team)
