"""Accesso a Supabase (PostgREST) con la chiave secret: solo oggetti dei contratti M2–M5."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx

PAGE = 1000
CHUNK = 100  # id per filtro `in.(...)`, per restare sotto i limiti di lunghezza dell'URL


class StoreError(RuntimeError):
    """Errore di Supabase. Non contiene mai la chiave."""


def _chunks(ids: Iterable[int]) -> list[list[int]]:
    values = sorted(set(ids))
    return [values[i : i + CHUNK] for i in range(0, len(values), CHUNK)]


def _in(ids: list[int]) -> str:
    return "in.(" + ",".join(str(i) for i in ids) + ")"


@dataclass
class SupabaseStore:
    url: str
    secret_key: str
    http: httpx.Client = field(default_factory=lambda: httpx.Client(timeout=120.0))

    def _headers(self) -> dict[str, str]:
        headers = {"apikey": self.secret_key, "Content-Type": "application/json"}
        if self.secret_key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {self.secret_key}"
        return headers

    def _request(self, method: str, path: str, what: str, **kwargs: Any) -> Any:
        try:
            response = self.http.request(
                method, f"{self.url}/rest/v1/{path}", headers=self._headers(), **kwargs
            )
        except httpx.HTTPError as exc:
            raise StoreError(f"Supabase {what}: {type(exc).__name__}") from None
        if response.status_code >= 400:
            try:
                body = response.json()
                detail = body.get("message") if isinstance(body, dict) else None
            except ValueError:
                detail = None
            raise StoreError(f"Supabase {what}: HTTP {response.status_code} {detail or ''}".strip())
        return response.json() if response.content else None

    def rpc(self, name: str, params: dict[str, Any]) -> Any:
        return self._request("POST", f"rpc/{name}", name, json=params)

    def select(self, relation: str, query: dict[str, str]) -> list[dict[str, Any]]:
        return self._request("GET", relation, relation, params=query) or []

    def _paged(self, relation: str, query: dict[str, str]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        while True:
            page = self.select(relation, {**query, "limit": str(PAGE), "offset": str(len(rows))})
            rows.extend(page)
            if len(page) < PAGE:
                return rows

    def _by_ids(
        self, ids: Iterable[int], fetch: Callable[[list[int]], list[dict[str, Any]]]
    ) -> list[dict[str, Any]]:
        return [row for chunk in _chunks(ids) for row in fetch(chunk)]

    # ---------------------------------------------------------------- letture
    def active_model_version(self) -> int | None:
        rows = self.select("model_versions", {"select": "id", "status": "eq.ACTIVE"})
        return int(rows[0]["id"]) if rows else None

    def upcoming_fixtures(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        return self._paged(
            "v_match_center",
            {
                "select": "match_id,kickoff_at,home_team_id,away_team_id",
                "status": "eq.SCHEDULED",
                "and": f"(kickoff_at.gt.{start.isoformat()},kickoff_at.lt.{end.isoformat()})",
                "order": "kickoff_at,match_id",
            },
        )

    def predictions(self, model_version_id: int, match_ids: Iterable[int]) -> list[dict[str, Any]]:
        return self._by_ids(
            match_ids,
            lambda chunk: self._paged(
                "predictions",
                {
                    "select": "id,match_id,market,line,selection,probability,push_probability,"
                    "confidence_score,as_of",
                    "model_version_id": f"eq.{model_version_id}",
                    "market": "eq.1X2",
                    "match_id": _in(chunk),
                    "order": "id",
                },
            ),
        )

    def odds_events(self, match_ids: Iterable[int]) -> list[dict[str, Any]]:
        return self._by_ids(
            match_ids,
            lambda chunk: self._paged(
                "odds_events",
                {"select": "id,match_id", "match_id": _in(chunk), "order": "id"},
            ),
        )

    def h2h_snapshots(self, event_ids: Iterable[int]) -> list[dict[str, Any]]:
        return self._by_ids(
            event_ids,
            lambda chunk: self._paged(
                "odds_snapshots",
                {
                    "select": "id,event_id,bookmaker,selection,price,provider,event_time,"
                    "observed_at,quality",
                    "market": "eq.h2h",
                    "event_id": _in(chunk),
                    "order": "id",
                },
            ),
        )

    def odds_max_age(self) -> dict[str, str]:
        rows = self.select(
            "source_freshness_rules", {"select": "provider,max_age", "data_kind": "eq.odds"}
        )
        return {r["provider"]: r["max_age"] for r in rows}

    # -------------------------------------------------------------- scritture
    def start_run(
        self, model_version_id: int, code_commit: str, rules: dict[str, object], triggered_by: str
    ) -> int:
        return int(
            self.rpc(
                "start_bet_builder_run",
                {
                    "p_model_version_id": model_version_id,
                    "p_code_commit": code_commit,
                    "p_rules": rules,
                    "p_triggered_by": triggered_by,
                },
            )
        )

    def record_proposals(self, run_id: int, proposals: list[dict[str, object]]) -> dict[str, int]:
        return self.rpc(
            "record_bet_proposals", {"p_run_id": run_id, "p_batch": {"proposals": proposals}}
        )

    def finish_run(self, run_id: int, status: str, candidates: int, error: str | None) -> None:
        self.rpc(
            "finish_bet_builder_run",
            {
                "p_run_id": run_id,
                "p_status": status,
                "p_candidates_evaluated": candidates,
                "p_error_summary": error,
            },
        )
