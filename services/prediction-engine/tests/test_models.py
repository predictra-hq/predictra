from datetime import timedelta

import numpy as np
import pytest

from predictra_engine.backtest import backtest_models
from predictra_engine.data import Fixture, training_data_hash
from predictra_engine.models import Baseline, Elo, all_models, dixon_coles_model, poisson_model


def fixture(home, away, comp=900):
    return Fixture(1, comp, None, home, away)  # type: ignore[arg-type]


def test_nessun_dato_successivo_ad_as_of(league):
    as_of = league[100].kickoff_at
    fitted = Baseline().fit(league, as_of)
    assert fitted.fits[900].matches == sum(1 for r in league if r.kickoff_at < as_of)


def test_probabilita_valide_per_ogni_modello(league):
    as_of = league[-1].kickoff_at + timedelta(days=1)
    for model in all_models():
        p = model.fit(league, as_of).probabilities_1x2(fixture(1, 20))
        assert p.sum() == pytest.approx(1)
        assert np.all(p > 0)


def test_i_modelli_ritrovano_la_squadra_piu_forte(league):
    as_of = league[-1].kickoff_at + timedelta(days=1)
    for model in (Elo(), poisson_model(), dixon_coles_model()):
        f = model.fit(league, as_of)
        strong_home = f.probabilities_1x2(fixture(1, 20))
        weak_home = f.probabilities_1x2(fixture(20, 1))
        assert strong_home[0] > 0.6, model.key
        assert weak_home[2] > strong_home[2], model.key


def test_adattamento_deterministico(league):
    as_of = league[-1].kickoff_at + timedelta(days=1)
    a = dixon_coles_model().fit(league, as_of).parameters()
    b = dixon_coles_model().fit(league, as_of).parameters()
    assert a == b


def test_squadra_sconosciuta_ha_forza_media(league):
    as_of = league[-1].kickoff_at + timedelta(days=1)
    lh, la, _ = poisson_model().fit(league, as_of).lambdas(fixture(999, 998))
    assert lh > la  # resta solo il vantaggio casalingo


def test_hash_dei_dati_indipendente_dall_ordine(league):
    assert training_data_hash(league) == training_data_hash(list(reversed(league)))
    assert len(training_data_hash(league)) == 64


def test_backtest_walk_forward_i_modelli_gol_battono_la_baseline(league):
    results = backtest_models([Baseline(), dixon_coles_model()], league)
    base, dc = results["baseline"], results["dixon_coles"]
    assert base.matches == dc.matches > 200
    assert dc.brier < base.brier
    assert dc.log_loss < base.log_loss
    assert 0 <= dc.ece < 0.2


def test_taratura_sola_lettura(league):
    from predictra_engine.tuning import candidates, tune

    rows = tune(league, candidates(l2_grid=(0.1, 3.0), xi_grid=(0.0,)))
    labels = {r.label for r in rows}
    assert {"baseline", "elo", "poisson[l2=3.0]", "dixon_coles[l2=0.1,xi=0.0]"} <= labels
    assert len({r.matches for r in rows}) == 1  # tutti sulle stesse partite
    assert rows == sorted(rows, key=lambda r: (r.log_loss, r.brier))
