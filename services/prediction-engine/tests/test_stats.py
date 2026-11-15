from datetime import timedelta

import pytest

from predictra_engine.models import poisson_model
from predictra_engine.stats import (
    MixedGoals,
    TeamStats,
    conversion_rates,
    expected,
    experiment,
    team_stats,
)


def stats_for(league, sot=4.0, xg=None):
    return {(r.match_id, team): TeamStats(sot, xg) for r in league for team in (r.home, r.away)}


def test_righe_lunghe_in_statistiche_per_squadra():
    rows = [
        {"match_id": 1, "team_id": 5, "stat": "shots_on_goal", "value": 6},
        {"match_id": 1, "team_id": 5, "stat": "expected_goals", "value": "1.4"},
        {"match_id": 1, "team_id": 6, "stat": "shots_on_goal", "value": None},
    ]
    s = team_stats(rows)
    assert s[(1, 5)] == TeamStats(6.0, 1.4)
    assert (1, 6) not in s


def test_conversione_solo_sulle_partite_precedenti(league):
    cut = league[100].kickoff_at
    rates = conversion_rates(league, stats_for(league), cut)
    before = [r for r in league if r.kickoff_at < cut]
    goals = sum(r.home_goals + r.away_goals for r in before)
    assert rates[900] == pytest.approx(goals / (8.0 * len(before)))


def test_attesi_preferisce_xg_poi_tiri(league):
    r = league[0]
    assert expected(r, r.home, {(r.match_id, r.home): TeamStats(5, 1.2)}, 0.3) == 1.2
    shots_only = {(r.match_id, r.home): TeamStats(5, None)}
    assert expected(r, r.home, shots_only, 0.3) == pytest.approx(1.5)
    assert expected(r, r.home, {}, 0.3) is None


def test_modello_misto_e_prova_in_sola_lettura(league):
    as_of = league[-1].kickoff_at + timedelta(days=1)
    model = MixedGoals(poisson_model(), 0.5, stats_for(league))
    p = model.fit(league, as_of).probabilities_1x2(
        type("F", (), {"competition_id": 900, "home": 1, "away": 20})()  # type: ignore[arg-type]
    )
    assert p.sum() == pytest.approx(1)
    lines = experiment(league, stats_for(league), start=league[-40].kickoff_at)
    assert any("attesi=0.5" in line for line in lines)
