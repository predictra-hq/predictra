from datetime import timedelta

from predictra_engine.models import Baseline, dixon_coles_model
from predictra_engine.pipeline import run, version_label

COMMIT = "abc1234"


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

    def training_results(self, as_of):
        return [as_row(r) for r in self.league if r.kickoff_at < as_of]

    def upcoming_fixtures(self, start, end):
        return self.fixtures

    def find_model_version(self, key, version):
        return self.versions.get((key, version))

    def latest_backtest_ece(self, mv):
        found = [b for b in self.backtests if b["model_version_id"] == mv]
        return found[-1]["ece"] if found else False

    def register_model_version(self, payload):
        mv = len(self.versions) + 1
        self.versions[(payload["model_key"], payload["version"])] = mv
        return mv

    def record_backtest(self, payload):
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
    summary = run(store, models, now=now, code_commit=COMMIT)
    assert not summary.failed
    assert len(store.versions) == 2
    assert len(store.backtests) == 2
    dc = next(
        b
        for b in store.backtests
        if b["model_version_id"]
        == store.versions[("dixon_coles", version_label(models[1], COMMIT))]
    )
    assert dc["baseline_brier"] is not None and dc["brier"] < dc["baseline_brier"]
    # Dixon-Coles: 98 righe per partita (tutti i mercati), baseline: solo 1X2.
    assert len(store.predictions) == 5 * 3 + 5 * 98
    assert len(store.matrices) == 5
    assert all(0 <= p["probability"] <= 1 for p in store.predictions)
    assert all(
        p["as_of"] <= f["kickoff_at"]
        for p in store.predictions
        for f in upcoming
        if f["match_id"] == p["match_id"]
    )
    assert {r[1] for r in store.runs} == {"SUCCEEDED"}

    # Seconda esecuzione con lo stesso codice: stesse versioni, nessun nuovo backtest.
    run(store, models, now=now + timedelta(hours=6), code_commit=COMMIT)
    assert len(store.versions) == 2
    assert len(store.backtests) == 2


def test_dry_run_non_scrive(league):
    past, upcoming, now = setup(league)
    store = FakeStore(past, upcoming)
    summary = run(
        store, [Baseline(), dixon_coles_model()], now=now, code_commit=COMMIT, dry_run=True
    )
    assert store.versions == {} and store.predictions == [] and store.backtests == []
    assert summary.models[1].backtest is not None
    assert summary.models[1].predictions == 5 * 98


def test_versione_dipende_da_iperparametri_e_commit():
    a = version_label(dixon_coles_model(), COMMIT)
    assert a.startswith("dixon_coles-") and a.endswith("-abc1234")
    assert version_label(dixon_coles_model(), "def5678") != a
