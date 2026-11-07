import copy

import pytest

from predictra_collector.football_data import STATUS_MAP, normalize_competition, season_label

OBS = "2026-11-07T18:00:00+00:00"


def test_partita_ufficiale_normalizzata(matches_payload):
    result = normalize_competition(matches_payload, None, OBS)
    assert result.issues == []
    batch = result.batch
    assert batch["competition"] == {
        "provider_id": "2015",
        "name": "Ligue 1",
        "code": "FL1",
        "type": "LEAGUE",
        "area_name": "France",
        "area_code": "FRA",
        "event_time": None,
    }
    assert batch["season"]["label"] == "2021/22"
    assert batch["season"]["start_date"] == "2021-08-06"
    assert batch["season"]["current_matchday"] == 38
    [match] = batch["matches"]
    assert match == {
        "provider_id": "330299",
        "matchday": 26,
        "stage": "REGULAR_SEASON",
        "group_name": None,
        "kickoff_at": "2022-02-27T16:05:00Z",
        "status": "FINISHED",
        "home_team_provider_id": "531",
        "away_team_provider_id": match["away_team_provider_id"],
        "home_score": 1,
        "away_score": 1,
        "home_score_ht": 0,
        "away_score_ht": 1,
        "score_duration": "REGULAR",
        "event_time": "2022-06-06T08:20:24Z",
        "quality": "OK",
    }
    teams = {t["provider_id"]: t for t in batch["teams"]}
    assert teams["531"]["name"] == "ES Troyes AC"
    assert teams["531"]["short_name"] == "Troyes"
    assert teams["531"]["tla"] == "ETR"
    assert batch["observed_at"] == OBS


def test_classifica_solo_totale(matches_payload, standings_fixture):
    batch = normalize_competition(None, standings_fixture, OBS).batch
    assert batch["competition"]["code"] == "PD"
    assert batch["season"]["label"] == "2021/22"
    total_rows = sum(
        len(g["table"]) for g in standings_fixture["standings"] if g["type"] == "TOTAL"
    )
    assert len(batch["standings"]) == total_rows
    first = batch["standings"][0]
    assert first == {
        "team_provider_id": "86",
        "standing_type": "TOTAL",
        "stage": "REGULAR_SEASON",
        "group_name": "",
        "position": 1,
        "played": 34,
        "won": 25,
        "draw": 6,
        "lost": 3,
        "goals_for": 73,
        "goals_against": 29,
        "points": 81,
        "event_time": OBS,
    }
    # Ogni squadra in classifica è anche nell'elenco squadre del lotto.
    team_ids = {t["provider_id"] for t in batch["teams"]}
    assert {s["team_provider_id"] for s in batch["standings"]} <= team_ids


def test_tutti_gli_stati_ufficiali_sono_mappati():
    ufficiali = {
        "SCHEDULED",
        "TIMED",
        "IN_PLAY",
        "PAUSED",
        "EXTRA_TIME",
        "PENALTY_SHOOTOUT",
        "FINISHED",
        "SUSPENDED",
        "POSTPONED",
        "CANCELLED",
        "AWARDED",
    }
    assert set(STATUS_MAP) == ufficiali
    assert STATUS_MAP["TIMED"] == "SCHEDULED"
    assert STATUS_MAP["PAUSED"] == "LIVE"


@pytest.mark.parametrize(
    ("start", "end", "label"),
    [("2021-08-06", "2022-05-21", "2021/22"), ("2026-04-01", "2026-12-06", "2026")],
)
def test_etichetta_stagione(start, end, label):
    assert season_label(start, end) == label


def test_partita_conclusa_senza_risultato_e_errore(matches_payload):
    payload = copy.deepcopy(matches_payload)
    payload["matches"][0]["score"]["fullTime"] = {"home": None, "away": None}
    result = normalize_competition(payload, None, OBS)
    assert result.batch["matches"][0]["quality"] == "ERROR"
    assert [i["check_code"] for i in result.issues] == ["match.score_missing"]
    assert result.issues[0]["provider_entity_id"] == "330299"


def test_squadre_da_definire_si_saltano(matches_payload):
    payload = copy.deepcopy(matches_payload)
    payload["matches"][0]["awayTeam"] = {"id": None, "name": None}
    result = normalize_competition(payload, None, OBS)
    assert result.batch["matches"] == []
    assert result.issues[0]["check_code"] == "match.teams_undefined"
    assert result.issues[0]["severity"] == "INFO"


def test_stato_sconosciuto_si_segnala(matches_payload):
    payload = copy.deepcopy(matches_payload)
    payload["matches"][0]["status"] = "NUOVO_STATO"
    result = normalize_competition(payload, None, OBS)
    assert result.batch["matches"] == []
    assert result.issues[0]["check_code"] == "match.status_unknown"


def test_supplementari_segnalati_da_verificare(matches_payload):
    payload = copy.deepcopy(matches_payload)
    payload["matches"][0]["score"]["duration"] = "PENALTY_SHOOTOUT"
    result = normalize_competition(payload, None, OBS)
    assert result.batch["matches"][0]["quality"] == "WARNING"
    assert result.issues[0]["check_code"] == "match.score_non_regular"


def test_risposta_vuota_non_produce_lotto():
    result = normalize_competition(None, None, OBS)
    assert result.batch is None
    assert result.issues[0]["check_code"] == "competition.payload_incomplete"
