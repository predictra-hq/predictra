"""Backfill API-Football: normalizzazione e flusso. Nessuna rete.

`af_fixtures_live_example.json` e `af_leagues_39_example.json` sono esempi ufficiali
della documentazione v3; le partite concluse costruite qui sono valori DEMO.
"""

import copy
import json
from pathlib import Path
from typing import Any

import httpx

from predictra_collector.api_football import ApiFootballClient
from predictra_collector.api_football_backfill import (
    backfill,
    normalize_season,
    parse_round,
)

FIXTURES = Path(__file__).parent / "fixtures"
OBS = "2026-11-11T16:00:00+00:00"


def load(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def league_entry() -> dict[str, Any]:
    return load("af_leagues_39_example.json")["response"][0]


def finished(fid: int, short: str, goals: tuple[int, int]) -> dict[str, Any]:
    """Partita conclusa DEMO con la struttura dell'esempio ufficiale."""
    item = copy.deepcopy(load("af_fixtures_live_example.json")["response"][0])
    item["fixture"]["id"] = fid
    item["fixture"]["status"] = {"long": "DEMO", "short": short, "elapsed": 90, "extra": None}
    item["goals"] = {"home": goals[0], "away": goals[1]}
    item["teams"]["home"]["name"] = "DEMO Casa"
    item["teams"]["away"]["name"] = "DEMO Ospite"
    return item


def test_turni():
    assert parse_round("Regular Season - 14") == ("REGULAR_SEASON", 14)
    assert parse_round("Group Stage - 3") == ("GROUP_STAGE", 3)
    assert parse_round("Round of 16") == ("LAST_16", None)
    assert parse_round("Quarter-finals") == ("QUARTER_FINALS", None)
    assert parse_round(None) == ("REGULAR_SEASON", None)


def test_normalizza_esempio_ufficiale():
    live = load("af_fixtures_live_example.json")["response"]
    league = league_entry()
    norm = normalize_season(league, league["seasons"][0], live, "PL", OBS)
    b = norm.batch
    assert b["competition"] == {
        "provider_id": "39",
        "name": "Premier League",
        "code": "PL",
        "type": "LEAGUE",
        "area_name": "England",
        "area_code": None,
        "event_time": None,
    }
    assert b["season"]["label"] == "2010/11"
    assert b["season"]["provider_id"] == "39-2010"
    m = b["matches"][0]
    assert m["provider_id"] == "239625"
    assert (m["status"], m["stage"], m["matchday"]) == ("LIVE", "REGULAR_SEASON", 14)
    assert (m["home_score"], m["away_score"], m["home_score_ht"]) == (0, 1, 0)
    assert m["score_duration"] is None
    assert {t["provider_id"] for t in b["teams"]} == {"967", "968"}
    assert norm.issues == []


def test_durata_e_problemi():
    league = league_entry()
    items = [finished(1, "FT", (2, 1)), finished(2, "PEN", (1, 1)), finished(3, "XYZ", (0, 0))]
    items[0]["goals"] = {"home": None, "away": None}
    norm = normalize_season(league, league["seasons"][0], items, "PL", OBS)
    durations = [m["score_duration"] for m in norm.batch["matches"]]
    assert durations == ["REGULAR", "PENALTY_SHOOTOUT", None]
    codes = sorted(i["check_code"] for i in norm.issues)
    assert codes == ["match.score_missing", "match.score_non_regular", "match.status_unknown"]


class FakeStore:
    def __init__(self, done: set[str]):
        self.done = done
        self.started: list[str] = []
        self.finished: list[tuple[int, str]] = []
        self.batches: list[dict[str, Any]] = []

    def teams(self) -> list[dict[str, Any]]:
        return []

    def succeeded_windows(self, provider: str, job_type: str) -> set[str]:
        assert (provider, job_type) == ("api-football", "af.backfill")
        return self.done

    def start_run(self, provider, job_type, window_key, triggered_by) -> int:
        self.started.append(window_key)
        return len(self.started)

    def ingest(self, run_id, batch):
        self.batches.append(batch)
        return {"matches": len(batch["matches"]), "teams": len(batch["teams"]), "teams_matched": 2}

    def report_issues(self, run_id, issues):
        pass

    def finish_run(self, run_id, status, **kwargs):
        self.finished.append((run_id, status))


def client_for(league_results: list[dict[str, Any]], used_today: int = 0):
    calls: list[str] = []
    status = load("af_status_example.json")
    status["response"]["requests"]["current"] = used_today
    league = league_entry()
    league["seasons"] = [
        {**league["seasons"][0], "year": y, "start": f"{y}-08-10", "end": f"{y + 1}-05-25"}
        for y in (2022, 2023, 2024)
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        headers = {"x-ratelimit-requests-remaining": "80", "X-RateLimit-Remaining": "9"}
        if request.url.path == "/status":
            return httpx.Response(200, json=status, headers=headers)
        if request.url.path == "/leagues":
            body = {
                "errors": [],
                "response": [league] if league_results is None else league_results,
            }
            return httpx.Response(200, json=body, headers=headers)
        body = {
            "errors": [],
            "response": [finished(int(request.url.params["season"]), "FT", (1, 0))],
        }
        return httpx.Response(200, json=body, headers=headers)

    client = ApiFootballClient(
        "chiave-demo", http=httpx.Client(transport=httpx.MockTransport(handler))
    )
    return client, calls


def test_riprende_e_salta_le_stagioni_fatte():
    client, calls = client_for(None)  # type: ignore[arg-type]
    store = FakeStore({"SA:2022"})
    summary = backfill(client, store, ("SA",), observed_at=OBS)
    assert summary.skipped == ["SA:2022"]
    assert store.started == ["SA:2023", "SA:2024"]
    assert [s for _, s in store.finished] == ["SUCCEEDED", "SUCCEEDED"]
    assert calls == ["/status", "/leagues", "/fixtures", "/fixtures"]
    assert summary.requests_used == 3
    assert store.batches[0]["competition"]["code"] == "SA"
    assert summary.results[0].teams_matched == 2


def test_tutto_fatto_nessuna_richiesta():
    client, calls = client_for(None)  # type: ignore[arg-type]
    summary = backfill(client, FakeStore({"SA:2022", "SA:2023", "SA:2024"}), ("SA",))
    assert calls == ["/status"]
    assert summary.requests_used == 0


def test_competizione_non_univoca_fallisce_senza_scrivere():
    client, _ = client_for([])
    store = FakeStore(set())
    summary = backfill(client, store, ("SA",))
    assert summary.failed
    assert store.started == []
    assert "0 risultati" in (summary.results[0].error or "")


def test_budget_conta_le_richieste_gia_usate_oggi():
    client, calls = client_for(None, used_today=88)  # type: ignore[arg-type]
    store = FakeStore(set())
    summary = backfill(client, store, ("SA",), observed_at=OBS)
    # budget = 90 - 88 = 2: /leagues e una stagione, poi ci si ferma
    assert calls == ["/status", "/leagues", "/fixtures"]
    assert summary.stopped
    assert store.started == ["SA:2022", "SA:2023"]
    assert store.finished[-1][1] == "FAILED"


def test_dry_run_non_scrive():
    client, calls = client_for(None)  # type: ignore[arg-type]
    summary = backfill(client, None, ("SA",), observed_at=OBS)
    assert [r.status for r in summary.results] == ["SUCCEEDED"] * 3
    assert calls.count("/fixtures") == 3


def test_abbinamento_ampio_dei_nomi():
    from predictra_collector.team_matching import TeamMatcher, tokens

    assert tokens("1. FC Köln") == tokens("FC Koln")
    assert tokens("FC Bayern München") == tokens("Bayern Munchen")
    rows = [
        {"id": 1, "name": "DEMO FC Bayern München", "short_name": "DEMO Bayern"},
        {"id": 2, "name": "DEMO Olympique de Marseille", "short_name": None},
        {"id": 3, "name": "DEMO Real Madrid CF", "short_name": "DEMO Real Madrid"},
        {"id": 4, "name": "DEMO Real Sociedad de Fútbol", "short_name": "DEMO Real Sociedad"},
        {"id": 5, "name": "DEMO Gamma", "short_name": None, "team_aliases": [{"alias": "DEMO G"}]},
    ]
    m = TeamMatcher.from_rows(rows)
    assert m.match("DEMO Bayern Munchen").id == 1  # type: ignore[union-attr]
    assert m.match("DEMO Marseille").id == 2  # type: ignore[union-attr]
    assert m.match("DEMO Real Madrid").id == 3  # type: ignore[union-attr]
    assert m.match("DEMO Real") is None  # ambiguo: due squadre "Real"
    assert m.match("DEMO Sconosciuta") is None
    assert m.match("DEMO G").id == 5  # type: ignore[union-attr]


def test_inclusione_scartata_se_la_squadra_e_gia_presa():
    from predictra_collector.team_matching import TeamMatcher

    rows = [
        {"id": 7, "name": "DEMO PSV", "team_aliases": [{"alias": "DEMO PSV Eindhoven"}]},
        {"id": 8, "name": "DEMO FC Internazionale Milano", "short_name": "DEMO Inter"},
    ]
    m = TeamMatcher.from_rows(rows)
    # da sola l'inclusione abbinerebbe; con la squadra già presa nello stesso lotto no
    assert m.match("DEMO FC Eindhoven").id == 7  # type: ignore[union-attr]
    got = m.match_all(["DEMO PSV Eindhoven", "DEMO FC Eindhoven"])
    assert got["DEMO PSV Eindhoven"].id == 7
    assert "DEMO FC Eindhoven" not in got
    got = m.match_all(["DEMO Inter", "DEMO Inter Club d'Escaldes"])
    assert got["DEMO Inter"].id == 8
    assert "DEMO Inter Club d'Escaldes" not in got


def test_alias_corto_non_abbina_un_nome_piu_lungo():
    from predictra_collector.team_matching import TeamMatcher

    m = TeamMatcher.from_rows(
        [{"id": 9, "name": "DEMO Sparta Rotterdam", "short_name": "DEMO Sparta"}]
    )
    assert m.match("DEMO Sparta Praha") is None
    assert m.match("DEMO Inter Club d'Escaldes") is None


def test_suggerimento_nel_lotto():
    from predictra_collector.team_matching import TeamMatcher

    league = league_entry()
    live = load("af_fixtures_live_example.json")["response"]
    matcher = TeamMatcher.from_rows([{"id": 42, "name": "Wydad Athletic Club"}])
    norm = normalize_season(league, league["seasons"][0], live, "PL", OBS, matcher)
    by_name = {t["name"]: t for t in norm.batch["teams"]}
    assert by_name["Wydad AC"]["same_as_team_id"] == 42
    assert "same_as_team_id" not in by_name["Rapide Oued ZEM"]
