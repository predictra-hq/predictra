"""Adapter football-data.org API v4 (scheda: docs/data-sources/football-data-org.md).

- Autenticazione con l'header ``X-Auth-Token``; la chiave non compare mai in log o errori.
- Piano Free: 10 richieste al minuto. Il client lascia almeno ``min_interval`` secondi
  tra una richiesta e l'altra.
- ``normalize_competition`` trasforma le risposte nel lotto canonico accettato da
  ``public.ingest_football_batch`` (ADR 0010) e restituisce i problemi di qualità trovati.
"""

from __future__ import annotations

import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

PROVIDER = "football-data-org"
BASE_URL = "https://api.football-data.org/v4"
DEFAULT_MIN_INTERVAL = 6.5  # secondi: 10 richieste/minuto con margine

# Corrispondenza stati football-data.org → stati canonici (ADR 0010 §1).
STATUS_MAP: dict[str, str] = {
    "SCHEDULED": "SCHEDULED",
    "TIMED": "SCHEDULED",
    "IN_PLAY": "LIVE",
    "PAUSED": "LIVE",
    "EXTRA_TIME": "LIVE",
    "PENALTY_SHOOTOUT": "LIVE",
    "FINISHED": "FINISHED",
    "POSTPONED": "POSTPONED",
    "SUSPENDED": "SUSPENDED",
    "CANCELLED": "CANCELLED",
    "AWARDED": "AWARDED",
}
COMPETITION_TYPES = {"LEAGUE", "CUP", "LEAGUE_CUP", "PLAYOFFS"}
SCORE_DURATIONS = {"REGULAR", "EXTRA_TIME", "PENALTY_SHOOTOUT"}
FINAL_STATUSES = {"FINISHED", "AWARDED"}

_TLA = re.compile(r"^[A-Z0-9]{2,5}$")
_AREA = re.compile(r"^[A-Z]{2,3}$")
_CODE = re.compile(r"^[A-Z0-9]{2,10}$")


class FootballDataError(RuntimeError):
    """Errore del provider. Il messaggio non contiene mai la chiave API."""


@dataclass
class FootballDataClient:
    api_key: str
    http: httpx.Client = field(default_factory=lambda: httpx.Client(timeout=30.0))
    min_interval: float = DEFAULT_MIN_INTERVAL
    sleep: Callable[[float], None] = time.sleep
    clock: Callable[[], float] = time.monotonic
    requests_used: int = 0
    _last_request: float | None = None

    def get(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any] | None:
        """GET su ``BASE_URL + path``. Restituisce ``None`` se la risorsa non esiste (404)."""
        if self._last_request is not None:
            wait = self.min_interval - (self.clock() - self._last_request)
            if wait > 0:
                self.sleep(wait)
        self._last_request = self.clock()
        self.requests_used += 1
        try:
            response = self.http.get(
                f"{BASE_URL}{path}", params=params, headers={"X-Auth-Token": self.api_key}
            )
        except httpx.HTTPError as exc:
            raise FootballDataError(
                f"Richiesta {path} non riuscita: {type(exc).__name__}"
            ) from None
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise FootballDataError(
                f"football-data.org {path}: HTTP {response.status_code} {_short_message(response)}"
            )
        data = response.json()
        if not isinstance(data, dict):
            raise FootballDataError(f"football-data.org {path}: risposta inattesa")
        return data

    def competition_matches(self, code: str) -> dict[str, Any] | None:
        return self.get(f"/competitions/{code}/matches")

    def competition_standings(self, code: str) -> dict[str, Any] | None:
        return self.get(f"/competitions/{code}/standings")


def _short_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return ""
    message = body.get("message") if isinstance(body, dict) else None
    return str(message)[:200] if message else ""


# --------------------------------------------------------------------------------------
# Normalizzazione
# --------------------------------------------------------------------------------------


@dataclass
class NormalizedBatch:
    batch: dict[str, Any] | None
    issues: list[dict[str, Any]]


def _pattern(value: Any, regex: re.Pattern[str]) -> str | None:
    return value if isinstance(value, str) and regex.match(value) else None


def season_label(start_date: str, end_date: str) -> str:
    start, end = start_date[:4], end_date[:4]
    return start if start == end else f"{start}/{end[2:]}"


def _issue(
    check_code: str,
    severity: str,
    entity_type: str | None = None,
    provider_entity_id: Any = None,
    **details: Any,
) -> dict[str, Any]:
    return {
        "check_code": check_code,
        "severity": severity,
        "entity_type": entity_type,
        "provider_entity_id": None if provider_entity_id is None else str(provider_entity_id),
        "details": details,
    }


def _team(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "provider_id": str(raw["id"]),
        "name": raw.get("name") or raw.get("shortName") or str(raw["id"]),
        "short_name": raw.get("shortName") or None,
        "tla": _pattern(raw.get("tla"), _TLA),
        "area_code": None,
        "event_time": None,
    }


def normalize_competition(
    matches_payload: dict[str, Any] | None,
    standings_payload: dict[str, Any] | None,
    observed_at: str,
) -> NormalizedBatch:
    """Costruisce il lotto di una competizione (stagione corrente) dalle risposte v4."""
    issues: list[dict[str, Any]] = []
    raw_matches: list[dict[str, Any]] = list((matches_payload or {}).get("matches") or [])
    first = raw_matches[0] if raw_matches else {}

    competition = (matches_payload or {}).get("competition") or (standings_payload or {}).get(
        "competition"
    )
    season = first.get("season") or (standings_payload or {}).get("season")
    area = (
        first.get("area")
        or (matches_payload or {}).get("area")
        or (standings_payload or {}).get("area")
        or {}
    )
    if not competition or not season or not season.get("startDate"):
        issues.append(_issue("competition.payload_incomplete", "ERROR"))
        return NormalizedBatch(None, issues)

    comp_type = competition.get("type")
    if comp_type not in COMPETITION_TYPES:
        issues.append(
            _issue(
                "competition.type_unknown",
                "ERROR",
                "competition",
                competition.get("id"),
                value=comp_type,
            )
        )
        return NormalizedBatch(None, issues)

    teams: dict[str, dict[str, Any]] = {}
    matches: list[dict[str, Any]] = []

    for raw in raw_matches:
        match_id = raw.get("id")
        home, away = raw.get("homeTeam") or {}, raw.get("awayTeam") or {}
        raw_status = raw.get("status")
        status = STATUS_MAP.get(raw_status or "")
        if match_id is None or not raw.get("utcDate"):
            issues.append(_issue("match.payload_incomplete", "ERROR", "match", match_id))
            continue
        if status is None:
            issues.append(
                _issue("match.status_unknown", "ERROR", "match", match_id, value=raw_status)
            )
            continue
        if home.get("id") is None or away.get("id") is None:
            # Turni a eliminazione diretta con squadre ancora da definire.
            issues.append(_issue("match.teams_undefined", "INFO", "match", match_id))
            continue
        if home["id"] == away["id"]:
            issues.append(_issue("match.same_team", "ERROR", "match", match_id))
            continue

        teams.setdefault(str(home["id"]), _team(home))
        teams.setdefault(str(away["id"]), _team(away))

        score = raw.get("score") or {}
        full = score.get("fullTime") or {}
        half = score.get("halfTime") or {}
        duration = score.get("duration") if score.get("duration") in SCORE_DURATIONS else None
        # Supplementari o rigori: si conserva il risultato al 90' (ADR 0034), da
        # `regularTime` quando la risposta lo contiene. Senza, resta l'avviso.
        regular = score.get("regularTime") or {}
        non_regular = duration in {"EXTRA_TIME", "PENALTY_SHOOTOUT"}
        regular_known = regular.get("home") is not None and regular.get("away") is not None
        if non_regular and regular_known:
            home_score, away_score = regular.get("home"), regular.get("away")
        else:
            home_score, away_score = full.get("home"), full.get("away")
        if (home_score is None) != (away_score is None):
            home_score = away_score = None
        ht_home, ht_away = half.get("home"), half.get("away")
        if (ht_home is None) != (ht_away is None):
            ht_home = ht_away = None

        quality = "OK"
        if status in FINAL_STATUSES and home_score is None:
            quality = "ERROR"
            issues.append(
                _issue("match.score_missing", "ERROR", "match", match_id, status=raw_status)
            )
        elif status == "SCHEDULED" and home_score is not None:
            quality = "WARNING"
            issues.append(
                _issue("match.score_unexpected", "WARNING", "match", match_id, status=raw_status)
            )
        if status in FINAL_STATUSES and non_regular and not regular_known:
            # Risultato al 90' non disponibile: `fullTime` può includere supplementari.
            quality = "WARNING" if quality == "OK" else quality
            issues.append(
                _issue("match.score_non_regular", "WARNING", "match", match_id, duration=duration)
            )

        matches.append(
            {
                "provider_id": str(match_id),
                "matchday": raw.get("matchday"),
                "stage": raw.get("stage"),
                "group_name": raw.get("group"),
                "kickoff_at": raw["utcDate"],
                "status": status,
                "home_team_provider_id": str(home["id"]),
                "away_team_provider_id": str(away["id"]),
                "home_score": home_score,
                "away_score": away_score,
                "home_score_ht": ht_home,
                "away_score_ht": ht_away,
                "score_duration": duration,
                "event_time": raw.get("lastUpdated") or raw["utcDate"],
                "quality": quality,
            }
        )

    standings: list[dict[str, Any]] = []
    for group in (standings_payload or {}).get("standings") or []:
        if group.get("type") != "TOTAL":
            continue  # ADR 0010: si conserva solo la classifica complessiva
        for row in group.get("table") or []:
            team = row.get("team") or {}
            if team.get("id") is None:
                issues.append(_issue("standing.team_missing", "WARNING"))
                continue
            teams.setdefault(str(team["id"]), _team(team))
            played = row.get("playedGames")
            won, draw, lost = row.get("won"), row.get("draw"), row.get("lost")
            if None not in (played, won, draw, lost) and won + draw + lost != played:
                issues.append(
                    _issue(
                        "standing.games_mismatch",
                        "WARNING",
                        "team",
                        team["id"],
                        played=played,
                        won=won,
                        draw=draw,
                        lost=lost,
                    )
                )
            standings.append(
                {
                    "team_provider_id": str(team["id"]),
                    "standing_type": "TOTAL",
                    "stage": group.get("stage") or "REGULAR_SEASON",
                    "group_name": group.get("group") or "",
                    "position": row.get("position"),
                    "played": played,
                    "won": won,
                    "draw": draw,
                    "lost": lost,
                    "goals_for": row.get("goalsFor"),
                    "goals_against": row.get("goalsAgainst"),
                    "points": row.get("points"),
                    "event_time": observed_at,
                }
            )

    batch = {
        "observed_at": observed_at,
        "competition": {
            "provider_id": str(competition["id"]),
            "name": competition.get("name"),
            "code": _pattern(competition.get("code"), _CODE),
            "type": comp_type,
            "area_name": area.get("name"),
            "area_code": _pattern(area.get("code"), _AREA),
            "event_time": None,
        },
        "season": {
            "provider_id": str(season["id"]),
            "label": season_label(season["startDate"], season["endDate"]),
            "start_date": season["startDate"],
            "end_date": season["endDate"],
            "current_matchday": season.get("currentMatchday"),
            "event_time": None,
        },
        "teams": list(teams.values()),
        "matches": matches,
        "standings": standings,
    }
    return NormalizedBatch(batch, issues)
