"""Pi-ratings ed Elo unico (prova ADR 0079): niente dati dal futuro, probabilità valide,
squadra forte riconosciuta, valutazioni comuni a più competizioni."""

from dataclasses import replace
from datetime import timedelta

import numpy as np
import pytest

from predictra_engine.data import Fixture
from predictra_engine.models.ratings import GlobalElo, PiRatings, _PiState


def fixture(home, away, comp=900):
    return Fixture(1, comp, None, home, away)


@pytest.mark.parametrize("model", [PiRatings(), GlobalElo()])
def test_probabilita_valide_e_squadra_forte(league, model):
    as_of = league[-1].kickoff_at + timedelta(days=1)
    fitted = model.fit(league, as_of)
    p = fitted.probabilities_1x2(fixture(1, 20))
    assert p.sum() == pytest.approx(1)
    assert (p > 0).all()
    # Nella lega simulata la squadra 1 è la più forte e la 20 la più debole.
    assert p[0] > p[2]
    assert fitted.probabilities_1x2(fixture(20, 1))[2] > fitted.probabilities_1x2(fixture(20, 1))[0]


@pytest.mark.parametrize("model", [PiRatings(), GlobalElo()])
def test_nessun_dato_successivo_ad_as_of(league, model):
    as_of = league[200].kickoff_at
    a = model.fit(league, as_of).probabilities_1x2(fixture(1, 20))
    b = model.fit(league[:200], as_of).probabilities_1x2(fixture(1, 20))
    assert a == pytest.approx(b)


def test_le_valutazioni_valgono_in_tutte_le_competizioni(league):
    # Le stesse squadre in una seconda competizione: il modello globale le conosce già.
    cup = [replace(r, competition_id=901, match_id=r.match_id + 100_000) for r in league[:30]]
    as_of = league[-1].kickoff_at + timedelta(days=1)
    fitted = PiRatings().fit(league + cup, as_of)
    assert fitted.probabilities_1x2(fixture(1, 20, 901)) == pytest.approx(
        fitted.probabilities_1x2(fixture(1, 20, 900))
    )


def test_pi_ratings_rendimenti_decrescenti():
    state = _PiState(lam=0.035, gamma=0.7, base=10.0, c=3.0)

    class R:
        home, away, home_goals, away_goals = 1, 2, 5, 0

    state.update(R)
    big = state.home[1]
    state2 = _PiState(lam=0.035, gamma=0.7, base=10.0, c=3.0)
    R.home_goals = 1
    state2.update(R)
    small = state2.home[1]
    # Un 5-0 vale più di un 1-0, ma meno di cinque volte tanto.
    assert small < big < 5 * small
    # Parte della correzione in casa passa alla valutazione in trasferta.
    assert state.away[1] == pytest.approx(big * 0.7)
    assert np.isfinite(state.diff(1, 2))
