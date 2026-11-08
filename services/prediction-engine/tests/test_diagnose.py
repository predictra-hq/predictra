from datetime import UTC, datetime

from predictra_engine.diagnose import diagnose

NOW = datetime(2026, 11, 8, 16, 0, tzinfo=UTC)


class FakeStore:
    def __init__(self, status="CANDIDATE", own=10, view=True):
        self.status, self.own, self.view = status, own, view

    def select(self, relation, query):
        if relation == "model_versions":
            return [
                {
                    "id": 1,
                    "model_key": "poisson",
                    "version": "poisson-x-abc1234",
                    "status": self.status,
                    "activated_at": "2026-11-08T15:50:00Z",
                }
            ]
        if relation == "v_model_versions_summary":
            return [{"model_version_id": 1, "beats_baseline": True, "backtest_id": 3}]
        if relation == "predictions":
            return [{"as_of": "2026-11-08T15:41:54Z"}]
        if relation == "v_active_predictions":
            return [{"match_id": 42}] if self.view else []
        raise AssertionError(relation)

    def count(self, relation, query):
        return self.own if "match_id" in query else 1862

    def upcoming_fixtures(self, start, end):
        return [{"match_id": 42}, {"match_id": 43}]


def test_nessuna_versione_attiva():
    d = diagnose(FakeStore(status="CANDIDATE"), NOW)
    assert d.verdict.startswith("NESSUNA VERSIONE ATTIVA")
    assert "previsioni=1862" in d.lines[1]


def test_versione_attiva_senza_previsioni_per_le_partite():
    assert diagnose(FakeStore(status="ACTIVE", own=0), NOW).verdict.startswith(
        "LA VERSIONE ATTIVA NON HA PREVISIONI"
    )


def test_vista_che_non_restituisce_righe():
    assert diagnose(FakeStore(status="ACTIVE", view=False), NOW).verdict.startswith(
        "LE PREVISIONI CI SONO"
    )


def test_dati_corretti():
    d = diagnose(FakeStore(status="ACTIVE"), NOW)
    assert d.verdict.startswith("DATI CORRETTI")
    assert any("1 partite su 2" in line for line in d.lines)
