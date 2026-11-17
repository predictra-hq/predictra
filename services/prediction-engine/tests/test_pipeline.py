from datetime import timedelta

from predictra_engine.models import Baseline, dixon_coles_model
from predictra_engine.pipeline import run, version_label

COMMIT = "abc1234"
CODE = "a" * 64  # impronta del codice dei modelli nei test


def as_row(r):
    return {
        "match_id": r.match_id,
        "competition_id": r.competition_id,
        "kickoff_at": r.kickoff_at.isoformat(),
        "home_team_id": r.home,
        "away_team_id": r.away,
        "home_score": r.home_goals,
        "away_score": r.away_goals,
    }


class FakeStore:
    def __init__(self, league, fixtures):
        self.league, self.fixtures = league, fixtures
        self.versions, self.backtests, self.predictions, self.matrices = {}, [], [], []
        self.runs = []
        self.active = None
        self.activations = []
        self.retired = []
        self.clock = None  # istante di registrazione dei backtest (lo imposta il test)

    def training_results(self, as_of):
        return [as_row(r) for r in self.league if r.kickoff_at < as_of]

    def upcoming_fixtures(self, start, end):
        return self.fixtures

    def find_model_version(self, key, version):
        return self.versions.get((key, version))

    def latest_backtest(self, mv):
        found = [b for b in self.backtests if b["model_version_id"] == mv]
        return found[-1] if found else None

    def active_model_version(self):
        return self.active

    def auto_activate(self, mv, reason):
        self.activations.append((mv, reason))
        self.active = mv

    def retire_superseded(self, keep):
        old = [v for v in self.versions.values() if v not in keep and v not in self.retired]
        self.retired.extend(old)
        return len(old)

    def register_model_version(self, payload):
        mv = len(self.versions) + 1
        self.versions[(payload["model_key"], payload["version"])] = mv
        return mv

    def record_backtest(self, payload):
        payload = {**payload, "created_at": self.clock.isoformat()}
        self.backtests.append(payload)
        return len(self.backtests)

    def start_run(self, mv, commit, triggered_by):
        self.runs.append([mv, "RUNNING"])
        return len(self.runs)

    def record_predictions(self, run_id, batch):
        self.predictions += batch.get("predictions", [])
        self.matrices += batch.get("score_matrices", [])
        return {"predictions": len(batch.get("predictions", [])), "score_matrices": 0}

    def finish_run(self, run_id, status, matches, error):
        self.runs[run_id - 1][1] = status

    def prune_predictions(self, keep_days):
        self.prune_calls = getattr(self, "prune_calls", 0) + 1
        batches = getattr(self, "prune_batches", [])
        return batches.pop(0) if batches else {"predictions": 0, "score_matrices": 0}


def setup(league):
    cutoff = league[-40].kickoff_at
    past = [r for r in league if r.kickoff_at < cutoff]
    upcoming = [
        {
            "match_id": r.match_id,
            "competition_id": r.competition_id,
            "kickoff_at": r.kickoff_at.isoformat(),
            "home_team_id": r.home,
            "away_team_id": r.away,
            "quality": "OK",
            "freshness": "FRESH",
        }
        for r in league[-5:]
    ]
    return past, upcoming, cutoff - timedelta(hours=1)


def test_scrittura_completa_e_idempotente(league):
    past, upcoming, now = setup(league)
    store = FakeStore(past, upcoming)
    models = [Baseline(), dixon_coles_model()]
    store.clock = now
    summary = run(store, models, now=now, code_commit=COMMIT, model_code=CODE)
    assert not summary.failed
    # Solo i modelli in gara si registrano: la baseline è un riferimento interno.
    assert len(store.versions) == 1
    assert len(store.backtests) == 1
    dc = next(
        b
        for b in store.backtests
        if b["model_version_id"] == store.versions[("dixon_coles", version_label(models[1], CODE))]
    )
    assert dc["baseline_brier"] is not None and dc["brier"] < dc["baseline_brier"]
    # Solo Dixon-Coles scrive previsioni: 98 righe per partita (tutti i mercati).
    assert len(store.predictions) == 5 * 98
    assert len(store.matrices) == 5
    assert all(0 <= p["probability"] <= 1 for p in store.predictions)
    assert all(
        p["as_of"] <= f["kickoff_at"]
        for p in store.predictions
        for f in upcoming
        if f["match_id"] == p["match_id"]
    )
    assert {r[1] for r in store.runs} == {"SUCCEEDED"}

    # Il modello più forte (Dixon-Coles batte la baseline) diventa attivo da solo.
    dc_id = store.versions[("dixon_coles", version_label(models[1], CODE))]
    assert store.activations == [(dc_id, "nessun modello attivo")]

    # Seconda esecuzione con lo stesso codice dei modelli ma un altro commit (per esempio
    # una modifica alla diagnosi): stesse versioni, nessun nuovo backtest, nessun cambio.
    run(store, models, now=now + timedelta(hours=6), code_commit="def5678", model_code=CODE)
    assert len(store.versions) == 1
    assert len(store.backtests) == 1
    assert len(store.activations) == 1

    # Codice dei modelli cambiato: versioni nuove, e la nuova più forte prende il posto
    # di quella attiva, che non riceverebbe più previsioni.
    run(store, models, now=now + timedelta(hours=12), code_commit="fff0000", model_code="b" * 64)
    assert len(store.versions) == 2
    new_dc = store.versions[("dixon_coles", version_label(models[1], "b" * 64))]
    assert store.activations[-1] == (new_dc, "il modello attivo appartiene a un codice superato")
    # La versione superata è ritirata: in elenco resta solo quella corrente.
    assert store.retired == [dc_id]


def test_confronto_settimanale_rifa_i_backtest_con_i_dati_aggiornati(league):
    past, upcoming, now = setup(league)
    store = FakeStore(past, upcoming)
    models = [Baseline(), dixon_coles_model()]
    store.clock = now
    run(store, models, now=now, code_commit=COMMIT, model_code=CODE)
    assert len(store.backtests) == 1

    # Dopo 3 giorni: backtest ancora validi, nessun nuovo confronto.
    store.clock = now + timedelta(days=3)
    s = run(store, models, now=now + timedelta(days=3), code_commit=COMMIT, model_code=CODE)
    assert len(store.backtests) == 1 and not s.refreshed_backtests

    # Dopo 8 giorni: tutti i modelli rifanno il backtest insieme, stesse versioni.
    store.clock = now + timedelta(days=8)
    s = run(store, models, now=now + timedelta(days=8), code_commit=COMMIT, model_code=CODE)
    assert s.refreshed_backtests
    assert len(store.backtests) == 2
    assert len(store.versions) == 1


def test_dry_run_non_scrive(league):
    past, upcoming, now = setup(league)
    store = FakeStore(past, upcoming)
    summary = run(
        store, [Baseline(), dixon_coles_model()], now=now, code_commit=COMMIT, dry_run=True
    )
    assert store.versions == {} and store.predictions == [] and store.backtests == []
    assert store.activations == []
    assert summary.selection is not None  # mostrata, non applicata
    assert summary.models[1].backtest is not None
    assert summary.models[1].predictions == 5 * 98
    assert summary.models[0].predictions == 0  # baseline: solo riferimento


def test_versione_dipende_da_iperparametri_e_codice_dei_modelli():
    a = version_label(dixon_coles_model(), "abc1234" + "0" * 57)
    assert a.startswith("dixon_coles-") and a.endswith("-abc1234")
    assert version_label(dixon_coles_model(), "def5678" + "0" * 57) != a


def test_in_gara_solo_il_modello_predictra(league):
    from predictra_engine.models import all_models

    past, upcoming, now = setup(league)
    store = FakeStore(past, upcoming)
    store.clock = now
    summary = run(store, all_models(), now=now, code_commit=COMMIT, model_code=CODE)
    # Un solo modello PREDICTRA (Dixon-Coles + Elo, ADR 0039): Poisson non è più in gara.
    assert {k for k, _ in store.versions} == {"dixon_coles"}
    # Baseline ed Elo lavorano comunque: backtest di riferimento e secondo parere.
    by_key = {m.key: m for m in summary.models}
    assert by_key["baseline"].backtest is not None and by_key["elo"].backtest is not None
    assert by_key["baseline"].predictions == 0 and by_key["elo"].predictions == 0


def test_pulizia_delle_previsioni_superate_a_fine_giro():
    """ADR 0041: a fine giro il motore cancella a blocchi le previsioni superate."""
    from predictra_engine.pipeline import prune

    store = FakeStore([], [])
    store.prune_batches = [
        {"predictions": 20000, "score_matrices": 10},
        {"predictions": 500, "score_matrices": 0},
    ]
    assert prune(store) == (20500, None)
    assert store.prune_calls == 3

    class Broken(FakeStore):
        def prune_predictions(self, keep_days):
            raise RuntimeError("rete")

    assert prune(Broken([], [])) == (0, "RuntimeError: rete")
