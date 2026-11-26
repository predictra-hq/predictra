"""Taratura automatica: si adotta solo un miglioramento oltre il rumore (ADR 0078)."""

from datetime import UTC, datetime

import numpy as np

from predictra_engine.autotune import Settings, Trial, clearly_better, paired_log_loss
from predictra_engine.backtest import BacktestResult

T0 = datetime(2026, 1, 1, tzinfo=UTC)


def result(probs: list[list[float]], outcomes: list[int]) -> BacktestResult:
    return BacktestResult(
        model_key="x",
        window_start=T0,
        window_end=T0,
        matches=len(outcomes),
        brier=0.0,
        log_loss=0.0,
        ece=0.0,
        probs=np.array(probs, dtype=float),
        outcomes=np.array(outcomes),
    )


def test_paired_log_loss_partita_per_partita():
    current = result([[0.5, 0.3, 0.2]] * 4, [0, 0, 1, 2])
    better = result([[0.6, 0.25, 0.15]] * 4, [0, 0, 1, 2])
    diff, se = paired_log_loss(better, current)
    home = -np.log(0.6) + np.log(0.5)
    expected = np.mean([home, home, -np.log(0.25) + np.log(0.3), -np.log(0.15) + np.log(0.2)])
    assert np.isclose(diff, expected)
    assert se > 0


def test_partite_diverse_o_troppo_poche_non_si_confrontano():
    a = result([[0.5, 0.3, 0.2]] * 2, [0, 1])
    b = result([[0.5, 0.3, 0.2]] * 2, [1, 0])
    assert paired_log_loss(a, b)[1] == float("inf")
    assert paired_log_loss(result([[0.5, 0.3, 0.2]], [0]), result([[0.5, 0.3, 0.2]], [0]))[
        1
    ] == float("inf")


def trial(diff: float, se: float) -> Trial:
    return Trial(Settings(0.002, 2.0, 0.4), 0.95, 0.2, 1500, diff, se)


def test_si_adotta_solo_oltre_due_errori_standard():
    assert clearly_better(trial(-0.004, 0.001), 0.001)
    # Migliore di MARGIN ma dentro il rumore: no.
    assert not clearly_better(trial(-0.002, 0.002), 0.001)
    # Oltre il rumore ma sotto MARGIN: no.
    assert not clearly_better(trial(-0.0008, 0.0001), 0.001)
    assert not clearly_better(trial(0.003, 0.0005), 0.001)
