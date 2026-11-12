"""Adapter API-Football v3 (scheda: docs/data-sources/api-football.md, ADR 0010 §5).

Primo passo della fase A3 del piano M2: client e verifica del piano (``probe``).
Il backfill arriva nella PR successiva, dopo aver letto con questa verifica quali
stagioni dà davvero il piano Free (la documentazione non lo dice).

Vincoli dai termini d'uso:

- solo richieste ``GET`` con il solo header ``x-apisports-key``;
- mai superare il limite al minuto (pena la sospensione): il client legge
  ``X-RateLimit-Remaining`` e aspetta il minuto successivo quando resta 1 chiamata;
- budget giornaliero sotto la quota (``DAILY_BUDGET`` su 100): raggiunta la quota,
  l'account resta sospeso fino a fine giornata;
- ``/status`` non consuma quota.

Gli errori del provider arrivano spesso con HTTP 200 e il campo ``errors`` non vuoto:
il client li trasforma in eccezioni. I messaggi non contengono mai la chiave.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

PROVIDER = "api-football"
BASE_URL = "https://v3.football.api-sports.io"
DAILY_BUDGET = 90  # ADR 0010 §5: 90 richieste su 100 al giorno
MINUTE_RESERVE = 1  # sotto questa soglia di X-RateLimit-Remaining si aspetta


class ApiFootballError(RuntimeError):
    """Errore del provider. Il messaggio non contiene mai la chiave."""


class DailyBudgetExhausted(ApiFootballError):
    """Budget giornaliero di questa esecuzione esaurito: ci si ferma prima della quota."""


def _int_header(response: httpx.Response, name: str) -> int | None:
    value = response.headers.get(name)
    try:
        return int(float(value)) if value is not None else None
    except ValueError:
        return None


def _errors_text(errors: Any) -> str:
    """`errors` è una lista vuota se va tutto bene, altrimenti lista o dizionario."""
    if isinstance(errors, dict):
        return "; ".join(f"{k}: {v}" for k, v in errors.items())[:300]
    if isinstance(errors, list):
        return "; ".join(str(e) for e in errors)[:300]
    return str(errors)[:300]


@dataclass
class ApiFootballClient:
    api_key: str
    http: httpx.Client = field(default_factory=lambda: httpx.Client(timeout=30.0))
    budget: int = DAILY_BUDGET
    sleep: Callable[[float], None] = time.sleep
    requests_used: int = 0
    day_remaining: int | None = None
    minute_remaining: int | None = None

    def _get(self, path: str, params: dict[str, str] | None = None, *, free: bool = False) -> Any:
        if not free and self.requests_used >= self.budget:
            raise DailyBudgetExhausted(
                f"Budget di {self.budget} richieste raggiunto: ci si ferma prima della quota"
            )
        if self.minute_remaining is not None and self.minute_remaining <= MINUTE_RESERVE:
            self.sleep(61.0)
            self.minute_remaining = None
        try:
            response = self.http.get(
                f"{BASE_URL}{path}",
                params=params or {},
                headers={"x-apisports-key": self.api_key},
            )
        except httpx.HTTPError as exc:
            raise ApiFootballError(f"Richiesta {path} non riuscita: {type(exc).__name__}") from None
        if not free:
            self.requests_used += 1
        day = _int_header(response, "x-ratelimit-requests-remaining")
        minute = _int_header(response, "X-RateLimit-Remaining")
        if day is not None:
            self.day_remaining = day
        if minute is not None:
            self.minute_remaining = minute
        if response.status_code >= 400:
            raise ApiFootballError(f"API-Football {path}: HTTP {response.status_code}")
        try:
            body = response.json()
        except ValueError:
            raise ApiFootballError(f"API-Football {path}: risposta non JSON") from None
        errors = body.get("errors") if isinstance(body, dict) else None
        if errors:
            raise ApiFootballError(f"API-Football {path}: {_errors_text(errors)}")
        return body

    def status(self) -> dict[str, Any]:
        """Piano e richieste del giorno. Non consuma quota (documentazione v3)."""
        body = self._get("/status", free=True)
        response = body.get("response")
        return response if isinstance(response, dict) else {}

    def leagues(self, **params: str) -> list[dict[str, Any]]:
        body = self._get("/leagues", params)
        response = body.get("response")
        return response if isinstance(response, list) else []

    def fixtures(self, **params: str) -> list[dict[str, Any]]:
        body = self._get("/fixtures", params)
        response = body.get("response")
        return response if isinstance(response, list) else []

    def fixture_statistics(self, fixture: str) -> list[dict[str, Any]]:
        """Statistiche di una partita (una richiesta; disponibile nel piano Free)."""
        body = self._get("/fixtures/statistics", {"fixture": fixture})
        response = body.get("response")
        return response if isinstance(response, list) else []

    def fixture_lineups(self, fixture: str) -> list[dict[str, Any]]:
        """Formazioni di una partita (una richiesta; disponibile nel piano Free)."""
        body = self._get("/fixtures/lineups", {"fixture": fixture})
        response = body.get("response")
        return response if isinstance(response, list) else []


@dataclass(frozen=True)
class SeasonInfo:
    year: int
    current: bool
    lineups: bool
    statistics_fixtures: bool


def seasons_of(league: dict[str, Any]) -> list[SeasonInfo]:
    """Stagioni e copertura dichiarata di una voce di `/leagues`."""
    out: list[SeasonInfo] = []
    for s in league.get("seasons") or []:
        fixtures = (s.get("coverage") or {}).get("fixtures") or {}
        try:
            year = int(s["year"])
        except (KeyError, TypeError, ValueError):
            continue
        out.append(
            SeasonInfo(
                year=year,
                current=bool(s.get("current")),
                lineups=bool(fixtures.get("lineups")),
                statistics_fixtures=bool(fixtures.get("statistics_fixtures")),
            )
        )
    return sorted(out, key=lambda x: x.year)


@dataclass
class ProbeReport:
    plan: str | None
    active: bool | None
    requests_today: int | None
    limit_day: int | None
    league_id: int | None = None
    league_name: str | None = None
    seasons: list[SeasonInfo] = field(default_factory=list)
    # anno → numero di partite restituite, oppure messaggio d'errore del provider
    access: dict[int, int | str] = field(default_factory=dict)


def probe(
    client: ApiFootballClient,
    *,
    name: str = "Serie A",
    country: str = "Italy",
    years: tuple[int, ...] = (2021, 2022, 2023, 2024, 2025),
) -> ProbeReport:
    """Verifica del piano: /status (gratis), /leagues (1), /fixtures per anno (1 ciascuno).

    Non scrive nulla. Non riporta nome ed email dell'account.
    """
    st = client.status()
    sub = st.get("subscription") or {}
    req = st.get("requests") or {}
    report = ProbeReport(
        plan=sub.get("plan"),
        active=sub.get("active"),
        requests_today=req.get("current"),
        limit_day=req.get("limit_day"),
    )
    found = client.leagues(name=name, country=country)
    if not found:
        return report
    league = found[0]
    info = league.get("league") or {}
    report.league_id = info.get("id")
    report.league_name = info.get("name")
    report.seasons = seasons_of(league)
    if report.league_id is None:
        return report
    for year in years:
        try:
            report.access[year] = len(
                client.fixtures(league=str(report.league_id), season=str(year))
            )
        except DailyBudgetExhausted:
            raise
        except ApiFootballError as exc:
            report.access[year] = str(exc)
    return report
