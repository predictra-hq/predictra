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


def _result(mid, comp, kickoff, home, away, hg=1, ag=1):
    from predictra_engine.data import MatchResult

    return MatchResult(mid, comp, kickoff, home, away, hg, ag)


def test_neopromossa_riconosciuta_solo_se_assente_l_anno_prima(league):
    """ADR 0038: è neopromossa chi gioca negli ultimi 300 giorni ma non nell'anno prima."""
    start = league[0].kickoff_at
    as_of = start + timedelta(days=800)
    old = [_result(1, 7, start + timedelta(days=d), 1, 2) for d in (10, 200)]
    recent = [
        _result(3, 7, as_of - timedelta(days=30), 1, 3),  # 3 nuova
        _result(4, 7, as_of - timedelta(days=20), 2, 1),  # 1 e 2 c'erano già
    ]
    model = poisson_model()
    assert model.newcomers(old + recent, as_of) == {3}
    # Storico troppo corto (nessuna partita nell'anno prima): nessuna neopromossa.
    assert model.newcomers(recent, as_of) == set()


def test_neopromossa_parte_piu_debole_a_parita_di_risultati():
    from datetime import UTC, datetime

    from predictra_engine.models.goals import GoalsModel

    t0 = datetime(2024, 8, 1, tzinfo=UTC)
    rows = []
    mid = 0
    # Stagione precedente: squadre 1–4 tutte uguali (pareggi 1-1).
    for d, (h, a) in enumerate([(1, 2), (3, 4), (2, 3), (4, 1)] * 10):
        mid += 1
        rows.append(_result(mid, 5, t0 + timedelta(days=3 * d), h, a))
    # Stagione corrente: entra la squadra 5, stessi risultati di tutti (1-1).
    t1 = t0 + timedelta(days=400)
    for d, (h, a) in enumerate([(5, 1), (2, 5), (3, 4), (5, 3)]):
        mid += 1
        rows.append(_result(mid, 5, t1 + timedelta(days=3 * d), h, a))
    as_of = t1 + timedelta(days=20)
    plain = GoalsModel("p", dixon_coles=False, xi=0.0015, l2=3.0).fit(rows, as_of)
    prior = poisson_model().fit(rows, as_of)
    fx = Fixture(1, 5, as_of, 5, 4)
    # Con il prior la neopromossa in casa vince meno spesso e perde più spesso.
    assert prior.probabilities_1x2(fx)[0] < plain.probabilities_1x2(fx)[0]
    assert prior.probabilities_1x2(fx)[2] > plain.probabilities_1x2(fx)[2]


def test_iperparametri_registrano_il_prior_solo_se_attivo():
    from predictra_engine.models.goals import GoalsModel

    assert "newcomer" not in GoalsModel("p", dixon_coles=False, xi=0.0).hyperparameters()
    hp = dixon_coles_model().hyperparameters()
    assert hp["xi_per_day"] == 0.001
    assert hp["newcomer"] == {"attack": -0.2, "defence": -0.1, "days": 300}


def test_combinato_gol_elo_coerente_su_tutti_i_mercati(league):
    """ADR 0039: 1X2 = media pesata gol/Elo; la matrice riporta le stesse probabilità."""
    from predictra_engine.models.blend import EloBlendModel, rescale_to_1x2
    from predictra_engine.models.goals import GoalsModel

    as_of = league[-1].kickoff_at + timedelta(days=1)
    goals = GoalsModel("g", dixon_coles=True, xi=0.001, l2=3.0)
    blend = EloBlendModel("dixon_coles", goals, Elo(), 0.4).fit(league, as_of)
    g = goals.fit(league, as_of)
    e = Elo().fit(league, as_of)
    fx = fixture(1, 20)
    expected = 0.6 * g.probabilities_1x2(fx) + 0.4 * e.probabilities_1x2(fx)
    assert blend.probabilities_1x2(fx) == pytest.approx(expected / expected.sum())

    m = blend.score_matrix(fx)
    assert m.sum() == pytest.approx(1)
    from_matrix = np.array([np.tril(m, -1).sum(), np.trace(m), np.triu(m, 1).sum()])
    assert from_matrix == pytest.approx(blend.probabilities_1x2(fx))
    # Dentro una zona le proporzioni tra punteggi restano quelle del modello gol.
    gm = g.score_matrix(fx)
    assert m[2, 0] / m[1, 0] == pytest.approx(gm[2, 0] / gm[1, 0])
    # Ricalibrare verso le probabilità che la matrice ha già non cambia nulla.
    same = rescale_to_1x2(gm, g.probabilities_1x2(fx))
    assert same == pytest.approx(gm)


def test_sfidante_dixon_coles_con_elo_registra_gli_iperparametri():
    hp = dixon_coles_model().hyperparameters()
    assert hp["dixon_coles"] is True
    assert hp["elo_weight"] == 0.4
    assert hp["elo"] == {"k": 20.0, "home_advantage": 60.0}
    assert dixon_coles_model().key == "dixon_coles"


def test_peso_elo_fuori_intervallo_rifiutato():
    from predictra_engine.models.blend import EloBlendModel

    with pytest.raises(ValueError):
        EloBlendModel("x", poisson_model(), Elo(), 1.5)
