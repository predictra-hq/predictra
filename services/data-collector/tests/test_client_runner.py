import httpx
import pytest

from predictra_collector.config import ConfigError, load_settings, parse_competitions
from predictra_collector.football_data import FootballDataClient, FootballDataError
from predictra_collector.runner import run
from predictra_collector.supabase_store import SupabaseStore

KEY = "chiave-di-test-non-reale"


def make_client(handler, sleeps=None):
    clock = iter(float(i) for i in range(1000))
    return FootballDataClient(
        api_key=KEY,
        http=httpx.Client(transport=httpx.MockTransport(handler)),
        sleep=(sleeps.append if sleeps is not None else lambda _s: None),
        clock=lambda: next(clock),
    )


def test_client_invia_la_chiave_e_rispetta_il_limite():
    seen, sleeps = [], []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.path, request.headers.get("X-Auth-Token")))
        return httpx.Response(200, json={"ok": True})

    client = make_client(handler, sleeps)
    client.get("/competitions/SA/matches")
    client.get("/competitions/SA/standings")
    assert seen == [("/v4/competitions/SA/matches", KEY), ("/v4/competitions/SA/standings", KEY)]
    assert client.requests_used == 2
    assert len(sleeps) == 1 and sleeps[0] > 0


def test_404_restituisce_none_e_gli_errori_non_contengono_la_chiave():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("standings"):
            return httpx.Response(404, json={"message": "not found"})
        return httpx.Response(429, json={"message": "Too many requests"})

    client = make_client(handler)
    assert client.competition_standings("CL") is None
    with pytest.raises(FootballDataError) as info:
        client.competition_matches("CL")
    assert "429" in str(info.value)
    assert KEY not in str(info.value)


class FakeStore:
    def __init__(self, fail_ingest=False):
        self.calls = []
        self.fail_ingest = fail_ingest

    def start_run(self, provider, job_type, window_key, triggered_by):
        self.calls.append(("start", provider, job_type, window_key, triggered_by))
        return len(self.calls)

    def ingest(self, run_id, batch):
        if self.fail_ingest:
            raise RuntimeError(f"errore con {KEY}")
        self.calls.append(("ingest", run_id, len(batch["matches"])))
        return {"matches": len(batch["matches"]), "teams": len(batch["teams"])}

    def report_issues(self, run_id, issues):
        self.calls.append(("issues", run_id, len(issues)))

    def finish_run(self, run_id, status, **kw):
        self.calls.append(("finish", run_id, status, kw))


def fixture_handler(matches_payload, standings_fixture):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/matches"):
            return httpx.Response(200, json=matches_payload)
        return httpx.Response(200, json=standings_fixture)

    return handler


def test_run_scrive_e_chiude_l_esecuzione(matches_payload, standings_fixture):
    store = FakeStore()
    summary = run(
        make_client(fixture_handler(matches_payload, standings_fixture)),
        store,
        ("FL1",),
        triggered_by="manual",
    )
    assert not summary.failed
    assert store.calls[0] == (
        "start",
        "football-data-org",
        "fd.competition",
        "FL1:current",
        "manual",
    )
    assert store.calls[1][0] == "ingest"
    finish = store.calls[-1]
    assert finish[:3] == ("finish", 1, "SUCCEEDED")
    assert finish[3]["requests_used"] == 2


def test_run_chiude_come_fallita_senza_esporre_segreti(matches_payload, standings_fixture):
    store = FakeStore(fail_ingest=True)
    summary = run(
        make_client(fixture_handler(matches_payload, standings_fixture)),
        store,
        ("FL1",),
        secrets=(KEY,),
    )
    assert summary.failed
    finish = store.calls[-1]
    assert finish[2] == "FAILED"
    assert KEY not in finish[3]["error_summary"]
    assert KEY not in (summary.results[0].error or "")


def test_dry_run_non_scrive(matches_payload, standings_fixture):
    summary = run(make_client(fixture_handler(matches_payload, standings_fixture)), None, ("FL1",))
    assert summary.results[0].matches == 1
    assert summary.results[0].standings > 0


def test_store_usa_solo_apikey_per_le_chiavi_sb_secret():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["apikey"] = request.headers.get("apikey")
        seen["auth"] = request.headers.get("Authorization")
        return httpx.Response(200, json=7)

    store = SupabaseStore(
        "https://example.invalid",
        "sb_secret_test",
        http=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    assert store.start_run("football-data-org", "fd.competition", "SA:current", "manual") == 7
    assert seen == {
        "path": "/rest/v1/rpc/start_ingestion_run",
        "apikey": "sb_secret_test",
        "auth": None,
    }


def test_configurazione():
    with pytest.raises(ConfigError):
        load_settings({}).require_football_data()
    with pytest.raises(ConfigError):
        load_settings({}).require_odds()
    s = load_settings(
        {"FOOTBALL_DATA_API_KEY": "x", "NEXT_PUBLIC_SUPABASE_URL": "https://a.supabase.co"}
    )
    assert s.supabase_url == "https://a.supabase.co"
    with pytest.raises(ConfigError):
        s.require_supabase()
    assert parse_competitions(None)[0] == "SA"
    assert parse_competitions("sa, pl,SA") == ("SA", "PL")
    with pytest.raises(ConfigError):
        parse_competitions("ELC")
