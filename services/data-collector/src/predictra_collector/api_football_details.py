"""Statistiche e formazioni da API-Football (M2 fase A3, ADR 0012).

- Si lavora per competizione e stagione, sulle stagioni dei risultati già scritti
  (job ``af.backfill``, chiave ``<codice>:<anno>``).
- Per ogni stagione: 1 richiesta ``/fixtures?league&season`` per l'elenco ordinato delle
  partite concluse, poi ``/fixtures?ids=`` a blocchi di 20, che restituisce statistiche
  e formazioni nella stessa risposta (documentazione v3). Circa 20 richieste a stagione.
- Ripresa: ogni stagione ha un'esecuzione ``af.details`` (chiave ``<codice>:<anno>``).
  Se il budget del giorno finisce a metà, l'esecuzione chiude ``PARTIAL`` con
  ``resume_cursor = {"next": <blocco>}`` e il giorno dopo riparte da lì. Una stagione
  finita chiude ``SUCCEEDED`` e non costa più nulla.
- Budget: lo stesso del backfill (90 richieste al giorno, contando quelle già usate).
"""

from __future__ import annotations

import contextlib
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from .api_football import DAILY_BUDGET, PROVIDER, ApiFootballClient, DailyBudgetExhausted
from .api_football_backfill import JOB_TYPE as RESULTS_JOB
from .api_football_backfill import LEAGUES, SEASONS
from .runner import sanitize

JOB_TYPE = "af.details"
CHUNK = 20  # massimo di `ids` per chiamata (documentazione v3)
FINISHED = {"FT", "AET", "PEN"}
_POSITIONS = {"G", "D", "M", "F"}
_GRID = re.compile(r"^[0-9]{1,2}:[0-9]{1,2}$")
_FORMATION = re.compile(r"^[0-9](-[0-9]){1,5}$")


class Store(Protocol):
    def succeeded_windows(
        self, provider: str, job_type: str, statuses: tuple[str, ...] = ...
    ) -> set[str]: ...
    def last_run(self, provider: str, job_type: str, window_key: str) -> dict[str, Any] | None: ...
    def start_run(
        self, provider: str, job_type: str, window_key: str, triggered_by: str
    ) -> int: ...
    def ingest_details(self, run_id: int, batch: dict[str, Any]) -> dict[str, Any]: ...
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
        resume_cursor: dict[str, Any] | None = None,
    ) -> None: ...


def stat_code(name: str) -> str | None:
    """ "Shots on Goal" -> shots_on_goal; "Passes %" -> passes_pct."""
    text = name.replace("%", " pct ").lower()
    code = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return code if re.fullmatch(r"[a-z0-9_]{2,40}", code) else None


def stat_value(value: Any) -> float | None:
    """Numero o percentuale ("32%") -> numero; tutto il resto -> None."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        v = value.strip().rstrip("%").strip()
        try:
            return float(v)
        except ValueError:
            return None
    return None


def _players(entries: Any, starter: bool) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for e in entries or []:
        p = (e or {}).get("player") or {}
        if p.get("id") is None or not p.get("name"):
            continue
        pos = p.get("pos") if p.get("pos") in _POSITIONS else None
        grid = p.get("grid") if isinstance(p.get("grid"), str) and _GRID.match(p["grid"]) else None
        number = p.get("number") if isinstance(p.get("number"), int) else None
        out.append(
            {
                "player_provider_id": str(p["id"]),
                "name": str(p["name"])[:120],
                "number": number,
                "position": pos,
                "grid": grid,
                "starter": starter,
            }
        )
    return out


def normalize_details(items: list[dict[str, Any]], observed_at: str) -> dict[str, Any]:
    """Lotto per `ingest_match_details` da una risposta di `/fixtures?ids=`."""
    matches: list[dict[str, Any]] = []
    for item in items:
        fx = item.get("fixture") or {}
        if fx.get("id") is None:
            continue
        teams: dict[str, dict[str, Any]] = {}
        for block in item.get("statistics") or []:
            tid = ((block or {}).get("team") or {}).get("id")
            if tid is None:
                continue
            stats = []
            for s in block.get("statistics") or []:
                code = stat_code(str((s or {}).get("type") or ""))
                if code:
                    stats.append({"stat": code, "value": stat_value(s.get("value"))})
            teams.setdefault(str(tid), {"team_provider_id": str(tid)})["statistics"] = stats
        for block in item.get("lineups") or []:
            tid = ((block or {}).get("team") or {}).get("id")
            if tid is None:
                continue
            coach = block.get("coach") or {}
            formation = block.get("formation")
            teams.setdefault(str(tid), {"team_provider_id": str(tid)})["lineup"] = {
                "formation": formation
                if isinstance(formation, str) and _FORMATION.match(formation)
                else None,
                "coach_provider_id": None if coach.get("id") is None else str(coach["id"]),
                "coach_name": coach.get("name"),
                "players": _players(block.get("startXI"), True)
                + _players(block.get("substitutes"), False),
            }
        if teams:
            matches.append(
                {
                    "match_provider_id": str(fx["id"]),
                    "event_time": fx.get("date"),
                    "teams": list(teams.values()),
                }
            )
    return {"observed_at": observed_at, "matches": matches}


@dataclass
class DetailsSeason:
    code: str
    year: int
    status: str
    chunks_done: int = 0
    chunks_total: int = 0
    matches: int = 0
    statistics: int = 0
    lineups: int = 0
    error: str | None = None


@dataclass
class DetailsSummary:
    seasons: list[DetailsSeason] = field(default_factory=list)
    requests_used: int = 0
    stopped: str | None = None
    complete: bool = False

    @property
    def failed(self) -> bool:
        return any(s.status == "FAILED" for s in self.seasons)


def _league_id(client: ApiFootballClient, code: str) -> int:
    name, country = LEAGUES[code]
    found = client.leagues(name=name, country=country)
    if len(found) != 1:
        raise LookupError(f"{code}: /leagues ha dato {len(found)} risultati invece di 1")
    return int(found[0]["league"]["id"])


def collect_details(
    client: ApiFootballClient,
    store: Store,
    competitions: tuple[str, ...],
    *,
    seasons: tuple[int, ...] = SEASONS,
    triggered_by: str = "manual",
    secrets: tuple[str, ...] = (),
    observed_at: str | None = None,
) -> DetailsSummary:
    """Scarica statistiche e formazioni delle stagioni già nel database, con ripresa."""
    summary = DetailsSummary()
    observed = observed_at or datetime.now(UTC).isoformat(timespec="seconds")
    used_today = (client.status().get("requests") or {}).get("current")
    if isinstance(used_today, int):
        client.budget = max(0, DAILY_BUDGET - used_today)

    have_results = store.succeeded_windows(PROVIDER, RESULTS_JOB)
    # Per i dettagli solo SUCCEEDED conta come finito: PARTIAL vuol dire "da riprendere".
    done = store.succeeded_windows(PROVIDER, JOB_TYPE, ("SUCCEEDED",))
    todo = [
        (code, year)
        for code in competitions
        for year in seasons
        if f"{code}:{year}" in have_results and f"{code}:{year}" not in done
    ]
    if not todo:
        summary.complete = True
        return summary

    league_ids: dict[str, int] = {}
    for code, year in todo:
        # Servono almeno 3 richieste: /leagues (se manca), elenco partite, un blocco.
        if client.budget - client.requests_used < 3:
            summary.stopped = f"Budget di {client.budget} richieste raggiunto"
            break
        key = f"{code}:{year}"
        result = DetailsSeason(code, year, "SUCCEEDED")
        before = client.requests_used
        run_id: int | None = None
        cursor = 0
        try:
            last = store.last_run(PROVIDER, JOB_TYPE, key)
            if last and isinstance(last.get("resume_cursor"), dict):
                cursor = int(last["resume_cursor"].get("next", 0))
            run_id = store.start_run(PROVIDER, JOB_TYPE, key, triggered_by)
            if code not in league_ids:
                league_ids[code] = _league_id(client, code)
            fixtures = client.fixtures(league=str(league_ids[code]), season=str(year))
            ids = sorted(
                str(f["fixture"]["id"])
                for f in fixtures
                if ((f.get("fixture") or {}).get("status") or {}).get("short") in FINISHED
            )
            chunks = [ids[i : i + CHUNK] for i in range(0, len(ids), CHUNK)]
            result.chunks_total = len(chunks)
            result.chunks_done = cursor
            while result.chunks_done < len(chunks):
                if client.requests_used >= client.budget:
                    result.status = "PARTIAL"
                    summary.stopped = f"Budget di {client.budget} richieste raggiunto"
                    break
                part = chunks[result.chunks_done]
                items = client.fixtures(ids="-".join(part))
                written = store.ingest_details(run_id, normalize_details(items, observed)) or {}
                result.matches += len(part)
                result.statistics += int(written.get("statistics", 0))
                result.lineups += int(written.get("lineups", 0))
                result.chunks_done += 1
            store.finish_run(
                run_id,
                result.status,
                requests_used=client.requests_used - before,
                rows_upserted=result.statistics + result.lineups,
                error_count=0,
                error_summary=None,
                quota_remaining=client.day_remaining,
                resume_cursor={"next": result.chunks_done} if result.status == "PARTIAL" else None,
            )
        except DailyBudgetExhausted as exc:
            result.status = "PARTIAL"
            summary.stopped = str(exc)
            if run_id is not None:
                with contextlib.suppress(Exception):
                    store.finish_run(
                        run_id,
                        "PARTIAL",
                        requests_used=client.requests_used - before,
                        rows_upserted=result.statistics + result.lineups,
                        error_count=0,
                        error_summary=None,
                        resume_cursor={"next": result.chunks_done},
                    )
        except Exception as exc:
            result.status = "FAILED"
            result.error = sanitize(f"{type(exc).__name__}: {exc}", secrets)
            if run_id is not None:
                with contextlib.suppress(Exception):
                    store.finish_run(
                        run_id,
                        "FAILED",
                        requests_used=client.requests_used - before,
                        rows_upserted=result.statistics + result.lineups,
                        error_count=1,
                        error_summary=result.error,
                        resume_cursor={"next": result.chunks_done},
                    )
        summary.seasons.append(result)
        if summary.stopped:
            break
    summary.requests_used = client.requests_used
    return summary
