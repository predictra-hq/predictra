"""Backfill storico da API-Football (M2 fase A3): risultati 2022-2024 della v1.

- Stagioni del piano Free verificate l'11/11/2026: 2022, 2023, 2024
  (docs/data-sources/api-football.md).
- Una esecuzione (`ingestion_runs`) per competizione e stagione, chiave
  ``<codice>:<anno>``. Le coppie già riuscite si saltano: rilanciare il comando
  riprende da dove si era fermato e non consuma richieste per il lavoro già fatto.
- Costo: 1 richiesta `/leagues` per competizione (ID e date delle stagioni) e 1
  richiesta `/fixtures` per stagione. Le 8 competizioni per 3 stagioni costano 32
  richieste, sotto il budget giornaliero di 90.
- La competizione si cerca per nome e paese con `/leagues`: niente ID scritti a mano.
  Se il risultato non è uno solo, la competizione fallisce con un messaggio chiaro.
- Le squadre si abbinano a quelle di football-data.org nel database (ADR 0011).
- Formazioni e statistiche non sono ancora nel modello dati: arrivano con una PR di
  contratto dedicata.
"""

from __future__ import annotations

import contextlib
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from .api_football import DAILY_BUDGET, PROVIDER, ApiFootballClient, DailyBudgetExhausted
from .football_data import season_label
from .runner import sanitize
from .team_matching import TeamMatcher

JOB_TYPE = "af.backfill"
SEASONS: tuple[int, ...] = (2022, 2023, 2024)

# Codice v1 (football-data.org) → (nome, paese) per la ricerca con /leagues.
LEAGUES: dict[str, tuple[str, str]] = {
    "SA": ("Serie A", "Italy"),
    "PL": ("Premier League", "England"),
    "PD": ("La Liga", "Spain"),
    "BL1": ("Bundesliga", "Germany"),
    "FL1": ("Ligue 1", "France"),
    "DED": ("Eredivisie", "Netherlands"),
    "PPL": ("Primeira Liga", "Portugal"),
    "CL": ("UEFA Champions League", "World"),
}

# Stato API-Football (documentazione v3, tabella degli stati) → match_status.
STATUS_MAP: dict[str, str] = {
    "TBD": "SCHEDULED",
    "NS": "SCHEDULED",
    "1H": "LIVE",
    "HT": "LIVE",
    "2H": "LIVE",
    "ET": "LIVE",
    "BT": "LIVE",
    "P": "LIVE",
    "INT": "LIVE",
    "LIVE": "LIVE",
    "SUSP": "SUSPENDED",
    "FT": "FINISHED",
    "AET": "FINISHED",
    "PEN": "FINISHED",
    "PST": "POSTPONED",
    "CANC": "CANCELLED",
    "ABD": "ABANDONED",
    "AWD": "AWARDED",
    "WO": "AWARDED",
}
DURATION: dict[str, str] = {"FT": "REGULAR", "AET": "EXTRA_TIME", "PEN": "PENALTY_SHOOTOUT"}
FINAL = {"FINISHED", "AWARDED"}

# Turni a eliminazione: stessi nomi di stage di football-data.org.
STAGES: dict[str, str] = {
    "round of 16": "LAST_16",
    "quarter-finals": "QUARTER_FINALS",
    "semi-finals": "SEMI_FINALS",
    "final": "FINAL",
}
_ROUND_NUMBER = re.compile(r"^(.*?)\s*-\s*(\d{1,3})$")


class Store(Protocol):
    def start_run(
        self, provider: str, job_type: str, window_key: str, triggered_by: str
    ) -> int: ...
    def ingest(self, run_id: int, batch: dict[str, Any]) -> dict[str, Any]: ...
    def report_issues(self, run_id: int, issues: list[dict[str, Any]]) -> None: ...
    def finish_run(
        self,
        run_id: int,
        status: str,
        *,
        requests_used: int,
        rows_upserted: int,
        error_count: int,
        error_summary: str | None,
        quota_remaining: int | None = None,
    ) -> None: ...
    def succeeded_windows(self, provider: str, job_type: str) -> set[str]: ...
    def teams(self) -> list[dict[str, Any]]: ...


def _issue(code: str, severity: str, entity_type: str | None, pid: Any, **details: Any):
    return {
        "check_code": code,
        "severity": severity,
        "entity_type": entity_type,
        "provider_entity_id": None if pid is None else str(pid),
        "details": details,
    }


def parse_round(value: str | None) -> tuple[str, int | None]:
    """ "Regular Season - 12" → ("REGULAR_SEASON", 12); "Round of 16" → ("LAST_16", None)."""
    text = (value or "").strip()
    if not text:
        return "REGULAR_SEASON", None
    m = _ROUND_NUMBER.match(text)
    name, number = (m.group(1), int(m.group(2))) if m else (text, None)
    stage = STAGES.get(name.lower()) or re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")
    return stage or "REGULAR_SEASON", number


@dataclass
class Normalized:
    batch: dict[str, Any]
    issues: list[dict[str, Any]]


def normalize_season(
    league: dict[str, Any],
    season: dict[str, Any],
    fixtures: list[dict[str, Any]],
    code: str,
    observed_at: str,
    matcher: TeamMatcher | None = None,
) -> Normalized:
    """Lotto per `ingest_football_batch` da una voce di /leagues e da /fixtures."""
    info = league["league"]
    year = int(season["year"])
    issues: list[dict[str, Any]] = []
    teams: dict[str, dict[str, Any]] = {}
    matches: list[dict[str, Any]] = []
    names = [
        ((item.get("teams") or {}).get(side) or {}).get("name") or ""
        for item in fixtures
        for side in ("home", "away")
    ]
    matched = matcher.match_all([n for n in names if n]) if matcher is not None else {}
    for item in fixtures:
        fx = item.get("fixture") or {}
        fid = fx.get("id")
        home = ((item.get("teams") or {}).get("home")) or {}
        away = ((item.get("teams") or {}).get("away")) or {}
        if fid is None or home.get("id") is None or away.get("id") is None:
            issues.append(_issue("match.incomplete", "ERROR", "match", fid))
            continue
        for t in (home, away):
            team = {
                "provider_id": str(t["id"]),
                "name": t.get("name") or str(t["id"]),
                "short_name": None,
                "tla": None,
                "area_code": None,
                "event_time": None,
            }
            known = matched.get(team["name"])
            if known is not None:
                team["same_as_team_id"] = known.id
                team["same_as_name"] = known.name  # solo per il riepilogo, il DB lo ignora
            teams[str(t["id"])] = team
        short = ((fx.get("status") or {}).get("short")) or ""
        status = STATUS_MAP.get(short)
        if status is None:
            issues.append(_issue("match.status_unknown", "WARNING", "match", fid, status=short))
            status = "SCHEDULED"
        goals = item.get("goals") or {}
        half = (item.get("score") or {}).get("halftime") or {}
        hs, as_ = goals.get("home"), goals.get("away")
        if (hs is None) != (as_ is None):
            hs = as_ = None
        duration = DURATION.get(short)
        if status in FINAL and hs is None:
            issues.append(_issue("match.score_missing", "ERROR", "match", fid, status=short))
        if duration in {"EXTRA_TIME", "PENALTY_SHOOTOUT"}:
            issues.append(
                _issue("match.score_non_regular", "WARNING", "match", fid, duration=duration)
            )
        stage, number = parse_round((item.get("league") or {}).get("round"))
        matches.append(
            {
                "provider_id": str(fid),
                "matchday": number,
                "stage": stage,
                "group_name": None,
                "kickoff_at": fx.get("date"),
                "status": status,
                "home_team_provider_id": str(home["id"]),
                "away_team_provider_id": str(away["id"]),
                "home_score": hs,
                "away_score": as_,
                "home_score_ht": half.get("home"),
                "away_score_ht": half.get("away"),
                "score_duration": duration,
                "event_time": fx.get("date"),
            }
        )
    batch = {
        "observed_at": observed_at,
        "competition": {
            "provider_id": str(info["id"]),
            "name": info.get("name"),
            "code": code,
            "type": "CUP" if str(info.get("type", "")).lower() == "cup" else "LEAGUE",
            "area_name": (league.get("country") or {}).get("name"),
            "area_code": None,
            "event_time": None,
        },
        "season": {
            "provider_id": f"{info['id']}-{year}",
            "label": season_label(season["start"], season["end"]),
            "start_date": season["start"],
            "end_date": season["end"],
            "current_matchday": None,
            "event_time": None,
        },
        "teams": list(teams.values()),
        "matches": matches,
        "standings": [],
    }
    return Normalized(batch, issues)


@dataclass
class SeasonResult:
    code: str
    year: int
    status: str
    matches: int = 0
    teams_matched: int = 0
    teams_unmatched: int = 0
    issues: int = 0
    error: str | None = None
    suggested: dict[str, str] = field(default_factory=dict)  # nome provider → nome nel DB
    without_match: list[str] = field(default_factory=list)


@dataclass
class BackfillSummary:
    results: list[SeasonResult] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    requests_used: int = 0
    stopped: str | None = None

    @property
    def failed(self) -> bool:
        return any(r.status == "FAILED" for r in self.results)


def _find_league(client: ApiFootballClient, code: str) -> dict[str, Any]:
    name, country = LEAGUES[code]
    found = client.leagues(name=name, country=country)
    if len(found) != 1:
        raise LookupError(
            f"{code}: /leagues con nome '{name}' e paese '{country}' ha dato "
            f"{len(found)} risultati invece di 1"
        )
    return found[0]


def backfill(
    client: ApiFootballClient,
    store: Store | None,
    competitions: tuple[str, ...],
    *,
    seasons: tuple[int, ...] = SEASONS,
    triggered_by: str = "manual",
    secrets: tuple[str, ...] = (),
    observed_at: str | None = None,
    matcher: TeamMatcher | None = None,
) -> BackfillSummary:
    """Scarica e scrive le stagioni mancanti. Con ``store=None`` (dry run) non scrive."""
    summary = BackfillSummary()
    observed = observed_at or datetime.now(UTC).isoformat(timespec="seconds")

    # Budget del giorno: mai oltre DAILY_BUDGET richieste contando quelle già usate oggi.
    req = client.status().get("requests") or {}
    used_today = req.get("current")
    if isinstance(used_today, int):
        client.budget = max(0, DAILY_BUDGET - used_today)

    done = store.succeeded_windows(PROVIDER, JOB_TYPE) if store is not None else set()
    if matcher is None and store is not None:
        matcher = TeamMatcher.from_rows(store.teams())
    for code in competitions:
        todo = [y for y in seasons if f"{code}:{y}" not in done]
        summary.skipped += [f"{code}:{y}" for y in seasons if f"{code}:{y}" in done]
        if not todo:
            continue
        # Serve almeno /leagues più una stagione: altrimenti si riprende domani.
        if client.budget - client.requests_used < 2:
            summary.stopped = (
                f"Budget di {client.budget} richieste raggiunto: ci si ferma prima della quota"
            )
            break
        try:
            league = _find_league(client, code)
        except DailyBudgetExhausted as exc:
            summary.stopped = str(exc)
            break
        except Exception as exc:
            message = sanitize(f"{type(exc).__name__}: {exc}", secrets)
            summary.results += [SeasonResult(code, y, "FAILED", error=message) for y in todo]
            continue
        by_year = {int(s["year"]): s for s in league.get("seasons") or [] if "year" in s}
        for year in todo:
            before = client.requests_used
            run_id: int | None = None
            try:
                season = by_year.get(year)
                if season is None:
                    raise LookupError(f"{code}: stagione {year} assente in /leagues")
                # Budget del giorno esaurito: ci si ferma prima di aprire l'esecuzione,
                # così non resta un'esecuzione "fallita" (è una fermata prevista).
                if client.requests_used >= client.budget:
                    raise DailyBudgetExhausted(
                        f"Budget di {client.budget} richieste raggiunto: "
                        "ci si ferma prima della quota"
                    )
                if store is not None:
                    run_id = store.start_run(PROVIDER, JOB_TYPE, f"{code}:{year}", triggered_by)
                fixtures = client.fixtures(league=str(league["league"]["id"]), season=str(year))
                norm = normalize_season(league, season, fixtures, code, observed, matcher)
                errors = sum(1 for i in norm.issues if i["severity"] == "ERROR")
                result = SeasonResult(
                    code,
                    year,
                    "PARTIAL" if errors else "SUCCEEDED",
                    matches=len(norm.batch["matches"]),
                    issues=len(norm.issues),
                    suggested={
                        t["name"]: t["same_as_name"]
                        for t in norm.batch["teams"]
                        if "same_as_name" in t
                    },
                    without_match=sorted(
                        t["name"] for t in norm.batch["teams"] if "same_as_name" not in t
                    ),
                )
                for t in norm.batch["teams"]:
                    t.pop("same_as_name", None)
                if not fixtures:
                    result.status = "FAILED"
                    result.error = "Nessuna partita restituita dal provider"
                if store is not None and run_id is not None:
                    written: dict[str, Any] = {}
                    if fixtures:
                        written = store.ingest(run_id, norm.batch) or {}
                    result.teams_matched = int(written.get("teams_matched", 0))
                    result.teams_unmatched = int(written.get("teams_unmatched", 0))
                    store.report_issues(run_id, norm.issues)
                    store.finish_run(
                        run_id,
                        result.status,
                        requests_used=client.requests_used - before,
                        rows_upserted=int(written.get("matches", 0)) + int(written.get("teams", 0)),
                        error_count=errors,
                        error_summary=result.error,
                        quota_remaining=client.day_remaining,
                    )
            except DailyBudgetExhausted as exc:
                summary.stopped = str(exc)
                if store is not None and run_id is not None:
                    with contextlib.suppress(Exception):
                        store.finish_run(
                            run_id,
                            "FAILED",
                            requests_used=0,
                            rows_upserted=0,
                            error_count=1,
                            error_summary=str(exc),
                        )
                break
            except Exception as exc:
                message = sanitize(f"{type(exc).__name__}: {exc}", secrets)
                result = SeasonResult(code, year, "FAILED", error=message)
                if store is not None and run_id is not None:
                    with contextlib.suppress(Exception):
                        store.finish_run(
                            run_id,
                            "FAILED",
                            requests_used=client.requests_used - before,
                            rows_upserted=0,
                            error_count=1,
                            error_summary=message,
                        )
            summary.results.append(result)
        if summary.stopped:
            break
    summary.requests_used = client.requests_used
    return summary
