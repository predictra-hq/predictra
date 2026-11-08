"""Accesso a Supabase (PostgREST) con la chiave secret: solo funzioni e viste del contratto M4."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx

PAGE = 1000
FIXTURE_COLUMNS = "match_id,competition_id,kickoff_at,home_team_id,away_team_id,quality,freshness"


class StoreError(RuntimeError):
    """Errore di Supabase. Non contiene mai la chiave."""


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

    def _check(self, response: httpx.Response, what: str) -> Any:
        if response.status_code >= 400:
            try:
                body = response.json()
                detail = body.get("message") if isinstance(body, dict) else None
            except ValueError:
                detail = None
            raise StoreError(f"Supabase {what}: HTTP {response.status_code} {detail or ''}".strip())
        return response.json() if response.content else None

    def _request(self, method: str, path: str, what: str, **kwargs: Any) -> Any:
        try:
            response = self.http.request(
                method, f"{self.url}/rest/v1/{path}", headers=self._headers(), **kwargs
            )
        except httpx.HTTPError as exc:
            raise StoreError(f"Supabase {what}: {type(exc).__name__}") from None
        return self._check(response, what)

    def rpc(self, name: str, params: dict[str, Any], query: dict[str, str] | None = None) -> Any:
        return self._request("POST", f"rpc/{name}", name, json=params, params=query)

    def select(self, relation: str, query: dict[str, str]) -> list[dict[str, Any]]:
        return self._request("GET", relation, relation, params=query) or []

    def _paged(self, fetch) -> list[dict[str, Any]]:  # type: ignore[no-untyped-def]
        rows: list[dict[str, Any]] = []
        while True:
            page = fetch(len(rows))
            rows.extend(page)
            if len(page) < PAGE:
                return rows

    # ---------------------------------------------------------------- letture
    def training_results(self, as_of: datetime) -> list[dict[str, Any]]:
        return self._paged(
            lambda offset: (
                self.rpc(
                    "training_results",
                    {"p_as_of": as_of.isoformat()},
                    {"limit": str(PAGE), "offset": str(offset)},
                )
                or []
            )
        )

    def upcoming_fixtures(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        return self._paged(
            lambda offset: self.select(
                "v_match_center",
                {
                    "select": FIXTURE_COLUMNS,
                    "status": "eq.SCHEDULED",
                    "and": f"(kickoff_at.gt.{start.isoformat()},kickoff_at.lt.{end.isoformat()})",
                    "order": "kickoff_at,match_id",
                    "limit": str(PAGE),
                    "offset": str(offset),
                },
            )
        )

    def find_model_version(self, model_key: str, version: str) -> int | None:
        rows = self.select(
            "model_versions",
            {"select": "id", "model_key": f"eq.{model_key}", "version": f"eq.{version}"},
        )
        return int(rows[0]["id"]) if rows else None

    def latest_backtest_ece(self, model_version_id: int) -> float | bool | None:
        """ECE dell'ultimo backtest; ``False`` se la versione non ha backtest."""
        rows = self.select(
            "backtests",
            {
                "select": "ece",
                "model_version_id": f"eq.{model_version_id}",
                "order": "created_at.desc",
                "limit": "1",
            },
        )
        if not rows:
            return False
        return None if rows[0]["ece"] is None else float(rows[0]["ece"])

    # -------------------------------------------------------------- scritture
    def register_model_version(self, payload: dict[str, Any]) -> int:
        return int(self.rpc("register_model_version", {"p": payload}))

    def record_backtest(self, payload: dict[str, Any]) -> int:
        return int(self.rpc("record_backtest", {"p": payload}))

    def start_run(self, model_version_id: int, code_commit: str, triggered_by: str) -> int:
        return int(
            self.rpc(
                "start_prediction_run",
                {
                    "p_model_version_id": model_version_id,
                    "p_code_commit": code_commit,
                    "p_triggered_by": triggered_by,
                },
            )
        )

    def record_predictions(self, run_id: int, batch: dict[str, Any]) -> dict[str, int]:
        return self.rpc("record_predictions", {"p_run_id": run_id, "p_batch": batch})

    def finish_run(self, run_id: int, status: str, matches: int, error: str | None) -> None:
        self.rpc(
            "finish_prediction_run",
            {
                "p_run_id": run_id,
                "p_status": status,
                "p_matches_scored": matches,
                "p_error_summary": error,
            },
        )
