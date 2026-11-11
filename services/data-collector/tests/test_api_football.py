"""API-Football: client e verifica del piano. Nessuna rete: trasporto finto di httpx.

Le risposte di `/status` e `/leagues` sono gli esempi ufficiali della documentazione v3
(tests/fixtures/README.md); gli errori e le partite sono valori DEMO del test.
"""

import json
from pathlib import Path

import httpx
import pytest

from predictra_collector.api_football import (
    ApiFootballClient,
    ApiFootballError,
    DailyBudgetExhausted,
    probe,
    seasons_of,
)
from predictra_collector.config import load_settings

FIXTURES = Path(__file__).parent / "fixtures"
KEY = "chiave-api-football-di-test"


def fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def client_with(handler, **kwargs) -> tuple[ApiFootballClient, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    http = httpx.Client(transport=httpx.MockTransport(record))
    sleeps: list[float] = []
    client = ApiFootballClient(KEY, http=http, sleep=sleeps.append, **kwargs)
    client.sleeps = sleeps  # type: ignore[attr-defined]
    return client, seen


def ok(body, *, day="99", minute="9"):
    return httpx.Response(
        200,
        json=body,
        headers={"x-ratelimit-requests-remaining": day, "X-RateLimit-Remaining": minute},
    )


def test_header_della_chiave_e_solo_get():
    client, seen = client_with(lambda r: ok(fixture("af_status_example.json")))
    client.status()
    req = seen[0]
    assert req.method == "GET"
    assert req.url.host == "v3.football.api-sports.io"
    assert req.headers["x-apisports-key"] == KEY
    assert KEY not in str(req.url)


def test_status_non_consuma_budget():
    client, _ = client_with(lambda r: ok(fixture("af_status_example.json")))
    st = client.status()
    assert st["subscription"]["plan"] == "Free"
    assert st["requests"] == {"current": 12, "limit_day": 100}
    assert client.requests_used == 0


def test_errori_con_http_200_diventano_eccezioni_senza_chiave():
    body = {"errors": {"plan": "DEMO: stagione non disponibile nel piano"}, "response": []}
    client, _ = client_with(lambda r: ok(body))
    with pytest.raises(ApiFootballError) as exc:
        client.fixtures(league="1", season="2025")
    assert "plan: DEMO" in str(exc.value)
    assert KEY not in str(exc.value)


def test_http_di_errore():
    client, _ = client_with(lambda r: httpx.Response(500))
    with pytest.raises(ApiFootballError, match="HTTP 500"):
        client.leagues(id="39")


def test_budget_giornaliero_ferma_prima_della_quota():
    client, seen = client_with(lambda r: ok({"errors": [], "response": []}), budget=2)
    client.fixtures(league="1", season="2023")
    client.fixtures(league="1", season="2024")
    with pytest.raises(DailyBudgetExhausted):
        client.fixtures(league="1", season="2022")
    assert len(seen) == 2


def test_aspetta_il_minuto_successivo_quando_resta_una_chiamata():
    client, _ = client_with(lambda r: ok({"errors": [], "response": []}, minute="1"))
    client.fixtures(league="1", season="2023")
    assert client.sleeps == []  # type: ignore[attr-defined]
    client.fixtures(league="1", season="2024")
    assert client.sleeps == [61.0]  # type: ignore[attr-defined]


def test_stagioni_e_copertura_dall_esempio_ufficiale():
    league = fixture("af_leagues_39_example.json")["response"][0]
    seasons = seasons_of(league)
    assert [s.year for s in seasons] == [2010, 2011]
    assert all(s.lineups and not s.statistics_fixtures for s in seasons)


def test_probe_riporta_piano_stagioni_e_accesso():
    league_body = fixture("af_leagues_39_example.json")

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/status":
            return ok(fixture("af_status_example.json"))
        if path == "/leagues":
            return ok(league_body)
        season = request.url.params["season"]
        if season == "2011":
            return ok({"errors": {"plan": "DEMO: non accessibile"}, "response": []})
        return ok({"errors": [], "response": [{"fixture": {"id": 1}}, {"fixture": {"id": 2}}]})

    client, seen = client_with(handler)
    report = probe(client, name="Premier League", country="England", years=(2010, 2011))
    assert (report.plan, report.active, report.limit_day) == ("Free", True, 100)
    assert report.league_id == 39
    assert report.access[2010] == 2
    assert "non accessibile" in str(report.access[2011])
    assert client.requests_used == 3  # /leagues + 2 chiamate /fixtures; /status è gratis
    assert [r.url.params.get("league") for r in seen if r.url.path == "/fixtures"] == ["39", "39"]


def test_chiave_dalla_variabile_e_tra_i_segreti():
    settings = load_settings({"API_FOOTBALL_KEY": f" {KEY} "})
    assert settings.require_api_football() == KEY
    assert KEY in settings.secrets()
