"""Statistiche e formazioni (ADR 0012): normalizzazione e ripresa. Nessuna rete.

`af_fixture_statistics_example.json` e `af_fixture_lineups_example.json` sono gli esempi
ufficiali della documentazione v3; l'elemento di `/fixtures?ids=` che li contiene e le
partite dell'elenco sono costruiti nel test (valori DEMO).
"""

import json
from pathlib import Path
from typing import Any

import httpx

from predictra_collector.api_football import ApiFootballClient
from predictra_collector.api_football_details import (
    collect_details,
    normalize_details,
    stat_code,
    stat_value,
)

FIXTURES = Path(__file__).parent / "fixtures"
OBS = "2026-11-12T01:00:00+00:00"


def load(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def detail_item(fid: int) -> dict[str, Any]:
    """Elemento di `/fixtures?ids=` con statistiche e formazioni degli esempi ufficiali."""
    return {
        "fixture": {"id": fid, "date": "2023-09-01T18:45:00+00:00"},
        "statistics": load("af_fixture_statistics_example.json")["response"],
        "lineups": load("af_fixture_lineups_example.json")["response"],
    }


def test_nomi_e_valori():
    assert stat_code("Shots on Goal") == "shots_on_goal"
    assert stat_code("Passes %") == "passes_pct"
    assert stat_code("expected_goals") == "expected_goals"
    assert stat_value("32%") == 32.0
    assert stat_value(9) == 9.0
    assert stat_value(None) is None
    assert stat_value("n/d") is None


def test_normalizza_esempi_ufficiali():
    batch = normalize_details([detail_item(592872)], OBS)
    (match,) = batch["matches"]
    assert match["match_provider_id"] == "592872"
    teams = {t["team_provider_id"]: t for t in match["teams"]}
    stats = {s["stat"]: s["value"] for s in teams["463"]["statistics"]}
    assert stats["shots_on_goal"] == 3.0
    assert stats["ball_possession"] == 32.0
    assert stats["goalkeeper_saves"] is None
    assert len(stats) == 16
    city = teams["50"]["lineup"]
    assert city["formation"] == "4-3-3"
    assert city["coach_name"] == "Guardiola"
    starters = [p for p in city["players"] if p["starter"]]
    assert len(starters) == 11 and len(city["players"]) == 20
    assert starters[0] == {
        "player_provider_id": "617",
        "name": "Ederson",
        "number": 31,
        "position": "G",
        "grid": "1:1",
        "starter": True,
    }


class FakeStore:
    def __init__(self, results_done, details_done=(), last=None):
        self.results_done, self.details_done, self.last = set(results_done), set(details_done), last
        self.started, self.finished, self.batches = [], [], []

    def succeeded_windows(self, provider, job_type, statuses=("SUCCEEDED", "PARTIAL")):
        return self.results_done if job_type == "af.backfill" else self.details_done

    def last_run(self, provider, job_type, window_key):
        return self.last

    def start_run(self, provider, job_type, window_key, triggered_by):
        self.started.append(window_key)
        return len(self.started)

    def ingest_details(self, run_id, batch):
        self.batches.append(batch)
        return {"statistics": 16 * len(batch["matches"]), "lineups": 2 * len(batch["matches"])}

    def finish_run(self, run_id, status, **kw):
        self.finished.append((status, kw.get("resume_cursor")))


def client_for(n_fixtures: int, used_today: int = 0):
    calls: list[str] = []
    status = load("af_status_example.json")
    status["response"]["requests"]["current"] = used_today
    league = load("af_leagues_39_example.json")

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path + ("?ids" if "ids" in request.url.params else ""))
        h = {"x-ratelimit-requests-remaining": "50", "X-RateLimit-Remaining": "9"}
        if request.url.path == "/status":
            return httpx.Response(200, json=status, headers=h)
        if request.url.path == "/leagues":
            return httpx.Response(200, json=league, headers=h)
        if "ids" in request.url.params:
            ids = request.url.params["ids"].split("-")
            body = {"errors": [], "response": [detail_item(int(i)) for i in ids]}
            return httpx.Response(200, json=body, headers=h)
        body = {
            "errors": [],
            "response": [
                {"fixture": {"id": 1000 + i, "status": {"short": "FT"}}} for i in range(n_fixtures)
            ]
            + [{"fixture": {"id": 9999, "status": {"short": "PST"}}}],
        }
        return httpx.Response(200, json=body, headers=h)

    http = httpx.Client(transport=httpx.MockTransport(handler))
    return ApiFootballClient("chiave-demo", http=http), calls


def test_solo_stagioni_con_risultati_e_blocchi_da_20():
    client, calls = client_for(45)
    store = FakeStore({"SA:2022"})
    summary = collect_details(client, store, ("SA", "PL"), observed_at=OBS)
    assert store.started == ["SA:2022"]  # PL senza risultati: niente
    assert calls == [
        "/status",
        "/leagues",
        "/fixtures",
        "/fixtures?ids",
        "/fixtures?ids",
        "/fixtures?ids",
    ]
    assert store.finished == [("SUCCEEDED", None)]
    (s,) = summary.seasons
    assert (s.chunks_total, s.chunks_done, s.matches) == (3, 3, 45)  # il rinvio PST è escluso


def test_budget_finito_a_meta_poi_ripresa_dal_cursore():
    client, calls = client_for(45, used_today=85)  # budget 5: /leagues, elenco, 3 blocchi
    store = FakeStore({"SA:2022"})
    s1 = collect_details(client, store, ("SA",), observed_at=OBS)
    assert store.finished[-1] == ("SUCCEEDED", None)  # 5 richieste bastano esattamente
    client, calls = client_for(45, used_today=87)  # budget 3: /leagues, elenco, 1 blocco
    store = FakeStore({"SA:2022"})
    s2 = collect_details(client, store, ("SA",), observed_at=OBS)
    assert s2.stopped and store.finished[-1] == ("PARTIAL", {"next": 1})
    # Giorno dopo: si riparte dal blocco 1, senza rifare il primo.
    client, calls = client_for(45)
    store = FakeStore({"SA:2022"}, last={"status": "PARTIAL", "resume_cursor": {"next": 1}})
    s3 = collect_details(client, store, ("SA",), observed_at=OBS)
    assert calls.count("/fixtures?ids") == 2
    assert store.finished[-1] == ("SUCCEEDED", None)
    assert s1.seasons and s3.seasons[0].chunks_done == 3


def test_tutto_fatto():
    client, calls = client_for(10)
    summary = collect_details(client, FakeStore({"SA:2022"}, {"SA:2022"}), ("SA",))
    assert summary.complete and calls == ["/status"]
