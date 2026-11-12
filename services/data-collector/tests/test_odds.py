import copy
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from predictra_collector.odds_runner import has_upcoming, run_odds, totals_affordable
from predictra_collector.the_odds_api import (
    BudgetExhausted,
    OddsApiClient,
    OddsApiError,
    normalize_odds,
    totals_market_code,
)

FIXTURE = Path(__file__).parent / "fixtures" / "odds_v4_example_nfl.json"
KEY = "chiave-odds-di-test"
OBS = "2026-11-07T18:00:00+00:00"


@pytest.fixture
def nfl():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def soccer_from(nfl, prices):
    """L'esempio ufficiale (NFL, quote americane) adattato a un 1X2 decimale DEMO.

    Si mantiene la struttura della risposta ufficiale; quote, nomi e pareggio sono
    valori DEMO del test, non dati reali.
    """
    ev = copy.deepcopy(nfl[0])
    ev["home_team"], ev["away_team"] = "DEMO Casa", "DEMO Ospite"
    book = ev["bookmakers"][0]
    book["key"], book["title"] = "demo_it", "DEMO (IT)"
    book["markets"] = [
        {
            "key": "h2h",
            "last_update": "2026-11-07T17:00:00Z",
            "outcomes": [
                {"name": "DEMO Casa", "price": prices[0]},
                {"name": "Draw", "price": prices[1]},
                {"name": "DEMO Ospite", "price": prices[2]},
            ],
        }
    ]
    ev["bookmakers"] = [book]
    return [ev]


def test_esempio_ufficiale_struttura_e_quote_americane_scartate(nfl):
    result = normalize_odds(nfl, "DEMO", "americanfootball_nfl", OBS)
    [ev] = result.batch["events"]
    assert ev["provider_event_id"] == "bda33adca828c09dc3cac3a856aef176"
    assert ev["home_team"] == "Tampa Bay Buccaneers"
    assert ev["away_team"] == "Dallas Cowboys"
    assert ev["commence_time"] == "2021-09-10T00:20:00Z"
    # Le quote americane negative non sono quote decimali valide: restano solo quelle > 1.
    for book in ev["bookmakers"]:
        for market in book["markets"]:
            assert market["key"] == "h2h"
            assert all(o["price"] > 1 for o in market["outcomes"])
            assert {o["selection"] for o in market["outcomes"]} <= {"HOME", "AWAY"}
    # I mercati spreads non sono nella v1.
    assert result.outcome_names == {"Dallas Cowboys", "Tampa Bay Buccaneers"}


def test_1x2_con_pareggio(nfl):
    result = normalize_odds(soccer_from(nfl, (2.0, 3.4, 4.0)), "DEMO", "soccer_demo", OBS)
    [ev] = result.batch["events"]
    [book] = ev["bookmakers"]
    assert book["key"] == "demo_it"
    assert book["region"] == "eu"
    [market] = book["markets"]
    assert market["last_update"] == "2026-11-07T17:00:00Z"
    assert market["outcomes"] == [
        {"selection": "HOME", "price": 2.0},
        {"selection": "DRAW", "price": 3.4},
        {"selection": "AWAY", "price": 4.0},
    ]
    assert result.batch["competition_code"] == "DEMO"


def test_esito_sconosciuto_scartato(nfl):
    events = soccer_from(nfl, (2.0, 3.4, 4.0))
    events[0]["bookmakers"][0]["markets"][0]["outcomes"][1]["name"] = "Pari"
    result = normalize_odds(events, "DEMO", "soccer_demo", OBS)
    selections = [
        o["selection"] for o in result.batch["events"][0]["bookmakers"][0]["markets"][0]["outcomes"]
    ]
    assert selections == ["HOME", "AWAY"]
    assert "Pari" in result.outcome_names


def make_client(handler, remaining="400"):
    def wrapped(request: httpx.Request) -> httpx.Response:
        resp = handler(request)
        resp.headers["x-requests-remaining"] = remaining
        resp.headers["x-requests-last"] = "1" if "/odds" in request.url.path else "0"
        return resp

    return OddsApiClient(api_key=KEY, http=httpx.Client(transport=httpx.MockTransport(wrapped)))


def test_client_usa_apikey_e_conta_i_crediti(nfl):
    seen = []

    def handler(request):
        seen.append(dict(request.url.params))
        return httpx.Response(200, json=soccer_from(nfl, (2, 3.4, 4)))

    client = make_client(handler)
    client.odds("soccer_italy_serie_a")
    assert seen[0] == {
        "regions": "eu",
        "markets": "h2h",
        "oddsFormat": "decimal",
        "dateFormat": "iso",
        "apiKey": KEY,
    }
    assert client.credits_used == 1
    assert client.remaining == 400


def test_errori_senza_chiave_ne_url():
    client = make_client(lambda r: httpx.Response(401, json={"message": "Invalid key"}))
    with pytest.raises(OddsApiError) as info:
        client.odds("soccer_epl")
    assert KEY not in str(info.value)
    assert "apiKey" not in str(info.value)
    assert "401" in str(info.value)


def test_riserva_di_crediti_ferma_la_raccolta(nfl):
    client = make_client(lambda r: httpx.Response(200, json=[]), remaining="15")
    client.odds("soccer_epl")  # prima chiamata: il residuo non è ancora noto
    with pytest.raises(BudgetExhausted):
        client.odds("soccer_epl")


class FakeStore:
    def __init__(self):
        self.calls = []

    def start_run(self, provider, job_type, window_key, triggered_by):
        self.calls.append(("start", provider, job_type, window_key))
        return 1

    def ingest_odds(self, run_id, batch):
        self.calls.append(("ingest", len(batch["events"])))
        return {"matched": 1, "snapshots_inserted": 3}

    def report_issues(self, run_id, issues):
        self.calls.append(("issues", len(issues)))

    def finish_run(self, run_id, status, **kw):
        self.calls.append(("finish", status, kw))


def test_run_odds_daily(nfl):
    store = FakeStore()
    client = make_client(lambda r: httpx.Response(200, json=soccer_from(nfl, (2, 3.4, 4))))
    summary = run_odds(client, store, ("SA",), mode="daily", triggered_by="manual")
    assert not summary.failed
    assert store.calls[0] == ("start", "the-odds-api", "odds.h2h", "SA:daily")
    finish = store.calls[-1]
    assert finish[1] == "SUCCEEDED"
    assert finish[2]["requests_used"] == 1
    assert finish[2]["quota_remaining"] == 400
    assert summary.results[0].matched == 1


def test_prematch_salta_le_competizioni_senza_partite_imminenti(nfl):
    calls = []

    def handler(request):
        calls.append(request.url.path)
        if request.url.path.endswith("/events"):
            return httpx.Response(200, json=[{"id": "x", "commence_time": "2026-11-10T19:45:00Z"}])
        return httpx.Response(200, json=[])

    now = datetime(2026, 11, 7, 16, 0, tzinfo=UTC)
    summary = run_odds(make_client(handler), None, ("SA",), mode="prematch", now=now)
    assert summary.results[0].status == "SKIPPED"
    assert all(p.endswith("/events") for p in calls)


def test_has_upcoming():
    now = datetime(2026, 11, 7, 16, 0, tzinfo=UTC)
    assert has_upcoming(
        [{"commence_time": "2026-11-07T19:45:00Z"}], now, __import__("datetime").timedelta(hours=6)
    )
    assert not has_upcoming(
        [{"commence_time": "2026-11-08T19:45:00Z"}], now, __import__("datetime").timedelta(hours=6)
    )
    assert not has_upcoming(
        [{"commence_time": "non-una-data"}], now, __import__("datetime").timedelta(hours=6)
    )


def test_under_over_una_voce_per_linea(nfl):
    events = soccer_from(nfl, (2, 3.4, 4))
    events[0]["bookmakers"][0]["markets"].append(
        {
            "key": "totals",
            "last_update": "2026-11-07T17:00:00Z",
            "outcomes": [
                {"name": "Over", "price": 1.9, "point": 2.5},
                {"name": "Under", "price": 1.95, "point": 2.5},
                {"name": "Over", "price": 1.8, "point": 2.25},  # linea asiatica: scartata
                {"name": "Under", "price": 0.9, "point": 2.5},  # quota non valida
            ],
        }
    )
    result = normalize_odds(events, "SA", "soccer_italy_serie_a", OBS)
    markets = result.batch["events"][0]["bookmakers"][0]["markets"]
    assert [m["key"] for m in markets] == ["h2h", "totals_2_5"]
    assert markets[1]["outcomes"] == [
        {"selection": "OVER", "price": 1.9},
        {"selection": "UNDER", "price": 1.95},
    ]
    assert totals_market_code(0.5) == "totals_0_5"
    assert totals_market_code(3.0) is None
    assert totals_market_code("2.5") is None


def test_under_over_solo_se_i_crediti_bastano_fino_a_fine_mese():
    now = datetime(2026, 11, 12, 7, 0, tzinfo=UTC)  # 19 giorni con oggi
    # riserva 20 + 19 giorni * 2 mercati * 8 competizioni = 324
    assert totals_affordable(451, now, 8)
    assert totals_affordable(324, now, 8)
    assert not totals_affordable(323, now, 8)
    assert not totals_affordable(None, now, 8)
    assert totals_affordable(52, datetime(2026, 12, 31, 7, 0, tzinfo=UTC), 8)  # 1 giorno


def test_run_odds_daily_chiede_under_over_quando_conviene(nfl):
    seen = []

    def handler(request):
        if request.url.path.endswith("/odds"):
            seen.append(request.url.params["markets"])
            return httpx.Response(200, json=soccer_from(nfl, (2, 3.4, 4)))
        return httpx.Response(200, json=[])

    now = datetime(2026, 11, 12, 7, 0, tzinfo=UTC)
    summary = run_odds(make_client(handler, remaining="451"), None, ("SA",), now=now)
    assert seen == ["h2h,totals"] and summary.markets == ("h2h", "totals")
    seen.clear()
    summary = run_odds(make_client(handler, remaining="30"), None, ("SA",), now=now)
    assert seen == ["h2h"] and summary.markets == ("h2h",)
    # Prima della partita (prematch) solo 1X2: servono le quote di chiusura.
    seen.clear()

    def prematch(request):
        if request.url.path.endswith("/events"):
            return httpx.Response(200, json=[{"id": "x", "commence_time": "2026-11-12T09:00:00Z"}])
        return handler(request)

    run_odds(make_client(prematch, remaining="451"), None, ("SA",), mode="prematch", now=now)
    assert seen == ["h2h"]
