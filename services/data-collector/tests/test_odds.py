import copy
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from predictra_collector.odds_runner import (
    daily_allowance,
    has_upcoming,
    plan_daily,
    run_odds,
)
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


NOW = datetime(2026, 11, 20, 7, 0, tzinfo=UTC)


def soon(nfl, hours=10):
    """Eventi DEMO con calcio d'inizio tra `hours` ore rispetto a NOW."""
    events = soccer_from(nfl, (2, 3.4, 4))
    events[0]["commence_time"] = (NOW + __import__("datetime").timedelta(hours=hours)).isoformat()
    return events


def test_run_odds_daily(nfl):
    store = FakeStore()

    def handler(request):
        if request.url.path == "/v4/sports":
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=soon(nfl))

    client = make_client(handler, remaining="30")  # budget del giorno: solo 1X2
    summary = run_odds(client, store, ("SA",), mode="daily", triggered_by="manual", now=NOW)
    assert not summary.failed
    assert store.calls[0] == ("start", "the-odds-api", "odds.h2h", "SA:daily")
    finish = store.calls[-1]
    assert finish[1] == "SUCCEEDED"
    assert finish[2]["requests_used"] == 1
    assert finish[2]["quota_remaining"] == 30
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


def test_budget_del_giorno():
    now = datetime(2026, 11, 12, 7, 0, tzinfo=UTC)  # 19 giorni con oggi
    assert daily_allowance(448, now) == (448 - 20) // 19  # 22
    assert daily_allowance(10, now) == 0
    assert daily_allowance(None, now) is None


def test_piano_priorita_1x2_under_over_doppia_chance(nfl):
    def ev(eid, hours):
        return {
            "id": eid,
            "commence_time": (NOW + __import__("datetime").timedelta(hours=hours)).isoformat(),
        }

    events = {
        "SA": [ev("a", 5), ev("b", 30), ev("c", 40)],
        "PL": [ev("d", 10)],
        "BL1": [ev("e", 100)],  # nessuna partita nelle 48 ore: nessun credito
    }
    # 11 giorni con oggi (20-30/11): budget (100 - 20) // 11 = 7
    plan = plan_daily(events, 100, NOW)
    assert plan.allowance == 7 and plan.due == ("SA", "PL")
    assert plan.markets == ("h2h", "totals")  # 2 x 2 = 4 crediti
    # restano 3 crediti: doppia chance per le partite entro 36 ore, dalla più vicina
    assert plan.double_chance == {"SA": ["a", "b"], "PL": ["d"]}
    assert plan.planned_credits == 7
    # budget stretto: solo 1X2, nessuna doppia chance
    tight = plan_daily(events, 20 + 11 * 2, NOW)
    assert tight.markets == ("h2h",) and tight.double_chance == {}
    # senza il dato dei crediti: solo 1X2
    assert plan_daily(events, None, NOW).markets == ("h2h",)


def test_run_odds_daily_segue_il_piano(nfl):
    seen = []

    def handler(request):
        path = request.url.path
        if path == "/v4/sports":
            return httpx.Response(200, json=[])
        if path.endswith("/events"):
            return httpx.Response(200, json=soon(nfl))
        if "/events/" in path:
            seen.append(("event", request.url.params["markets"]))
            ev = soon(nfl)[0]
            ev["bookmakers"][0]["markets"] = [
                {
                    "key": "double_chance",
                    "last_update": "2026-11-20T06:00:00Z",
                    "outcomes": [
                        {"name": "DEMO Casa or Draw", "price": 1.3},
                        {"name": "DEMO Ospite or Draw", "price": 2.1},
                        {"name": "DEMO Casa or DEMO Ospite", "price": 1.25},
                    ],
                }
            ]
            return httpx.Response(200, json=ev)
        seen.append(("league", request.url.params["markets"]))
        return httpx.Response(200, json=soon(nfl))

    store = FakeStore()
    store.batches = []
    original = store.ingest_odds

    def ingest(run_id, batch):
        store.batches.append(batch)
        return original(run_id, batch)

    store.ingest_odds = ingest
    summary = run_odds(make_client(handler, remaining="451"), store, ("SA",), now=NOW)
    assert seen == [("league", "h2h,totals"), ("event", "double_chance")]
    markets = [m["key"] for m in store.batches[0]["events"][0]["bookmakers"][0]["markets"]]
    assert markets == ["h2h", "double_chance"]
    dc = store.batches[0]["events"][0]["bookmakers"][0]["markets"][1]["outcomes"]
    assert [o["selection"] for o in dc] == ["HOME_DRAW", "DRAW_AWAY", "HOME_AWAY"]
    assert summary.plan.double_chance == {"SA": [soon(nfl)[0]["id"]]}
    # prima della partita: solo 1X2, nessun piano
    seen.clear()

    def prematch(request):
        if request.url.path.endswith("/events"):
            return httpx.Response(200, json=soon(nfl, 2))
        return handler(request)

    run_odds(make_client(prematch, remaining="451"), None, ("SA",), mode="prematch", now=NOW)
    assert seen == [("league", "h2h")]


def test_competizione_senza_partite_vicine_non_spende(nfl):
    calls = []

    def handler(request):
        calls.append(request.url.path)
        if request.url.path == "/v4/sports":
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=soon(nfl, 100))

    summary = run_odds(make_client(handler, remaining="451"), None, ("SA",), now=NOW)
    assert summary.results[0].status == "SKIPPED"
    assert not any(p.endswith("/odds") for p in calls)
