"""Modello unico su tutte le competizioni (comando ``cross``, sola lettura). Dati DEMO."""

from datetime import timedelta

import numpy as np
import pytest
from conftest import simulate_league

from predictra_engine.cross import JointPoisson
from predictra_engine.data import Fixture, MatchResult
from predictra_engine.models.joint import fit_joint


def two_leagues_and_cup() -> list[MatchResult]:
    """Due campionati DEMO (squadre 1–20 e 101–120) e una coppa tra le prime di ciascuno.

    Nel campionato B le squadre segnano come nel campionato A, ma in coppa le squadre di A
    sono più forti: solo la coppa dice quale campionato è migliore.
    """
    a = simulate_league(seed=1, competition_id=901)
    b = [
        MatchResult(
            r.match_id + 5_000,
            902,
            r.kickoff_at,
            r.home + 100,
            r.away + 100,
            r.home_goals,
            r.away_goals,
        )
        for r in simulate_league(seed=2, competition_id=902)
    ]
    rng = np.random.default_rng(3)
    cup = []
    start = a[-1].kickoff_at + timedelta(days=1)
    for i in range(120):
        ha = i % 2 == 0
        top_a, top_b = 1 + i % 5, 101 + (i * 3) % 5
        home, away = (top_a, top_b) if ha else (top_b, top_a)
        lh = np.exp(0.3 + (0.4 if ha else -0.4))
        la = np.exp(0.1 + (-0.4 if ha else 0.4))
        cup.append(
            MatchResult(
                90_000 + i,
                903,
                start + timedelta(days=i),
                home,
                away,
                int(rng.poisson(lh)),
                int(rng.poisson(la)),
            )
        )
    return a + b + cup


def test_gradiente_esatto():
    from scipy.optimize import check_grad

    from predictra_engine.models.joint import objective

    rows = two_leagues_and_cup()[::7]
    as_of = rows[-1].kickoff_at + timedelta(days=1)
    f, size = objective(rows, as_of, xi=0.001, l2=3.0)
    theta = np.random.default_rng(5).normal(0, 0.1, size)
    err = check_grad(lambda t: f(t)[0], lambda t: f(t)[1], theta)
    assert err < 1e-3 * max(1.0, abs(f(theta)[0]))


def test_la_coppa_collega_i_campionati():
    rows = two_leagues_and_cup()
    as_of = rows[-1].kickoff_at + timedelta(days=1)
    fit = fit_joint(rows, as_of, xi=0.0, l2=1.0)
    strength = {t: fit.attack[i] + fit.defence[i] for t, i in fit.teams.items()}
    # Le prime di A più forti delle prime di B, anche se nei campionati segnano uguale.
    assert np.mean([strength[t] for t in range(1, 6)]) > np.mean(
        [strength[t] for t in range(101, 106)]
    )
    p = fit.probabilities_1x2(Fixture(1, 903, as_of, 1, 101))
    assert p.sum() == pytest.approx(1.0)
    assert p[0] > p[2]


def test_adattatore_per_il_backtest():
    rows = two_leagues_and_cup()
    model = JointPoisson(0.0015, 3.0)
    fitted = model.fit(rows, rows[-1].kickoff_at)
    assert fitted.covers(Fixture(1, 901, rows[-1].kickoff_at, 1, 2))
    assert not fitted.covers(Fixture(1, 999, rows[-1].kickoff_at, 1, 2))


def test_modello_predictra_media_con_il_modello_unico():
    """ADR 0074: 1X2 = media pesata tra Dixon-Coles + Elo e modello unico; mercati coerenti."""
    from predictra_engine.cross import previous_model
    from predictra_engine.models import dixon_coles_model
    from predictra_engine.models.joint import fit_joint as joint_fit

    rows = two_leagues_and_cup()
    as_of = rows[-1].kickoff_at + timedelta(days=1)
    model = dixon_coles_model()
    fitted = model.fit(rows, as_of)
    before = previous_model().fit(rows, as_of)
    joint = joint_fit(rows, as_of, model.joint_xi, model.joint_l2)
    fx = Fixture(1, 903, as_of, 1, 101)
    w = model.joint_weight
    assert w == 0.3
    expected = (1 - w) * before.probabilities_1x2(fx) + w * joint.probabilities_1x2(fx)
    assert fitted.probabilities_1x2(fx) == pytest.approx(expected / expected.sum())
    m = fitted.score_matrix(fx)
    assert m.sum() == pytest.approx(1.0)
    zones = [np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()]
    assert zones == pytest.approx(list(fitted.probabilities_1x2(fx)))
    assert "joint" in model.hyperparameters()
    assert fitted.parameters()["903"]["joint_weight"] == 0.3
