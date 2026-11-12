"""Scrittura su Supabase tramite le funzioni RPC del contratto M2 (PostgREST).

Usa la chiave secret (service_role): solo lato server, mai nei log.
Funzioni: docs/data-dictionary/football.md, sezione "Funzioni".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx


class StoreError(RuntimeError):
    """Errore restituito da Supabase. Non contiene mai la chiave."""


@dataclass
class SupabaseStore:
    url: str
    secret_key: str
    http: httpx.Client = field(default_factory=lambda: httpx.Client(timeout=60.0))

    def _headers(self) -> dict[str, str]:
        headers = {"apikey": self.secret_key, "Content-Type": "application/json"}
        # Le chiavi legacy (JWT service_role) vanno anche nell'header Authorization;
        # le nuove chiavi sb_secret_ si inviano solo come apikey.
        if self.secret_key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {self.secret_key}"
        return headers

    def rpc(self, name: str, params: dict[str, Any]) -> Any:
        try:
            response = self.http.post(
                f"{self.url}/rest/v1/rpc/{name}", json=params, headers=self._headers()
            )
        except httpx.HTTPError as exc:
            raise StoreError(f"Supabase {name}: {type(exc).__name__}") from None
        if response.status_code >= 400:
            try:
                body = response.json()
                detail = body.get("message") if isinstance(body, dict) else None
            except ValueError:
                detail = None
            raise StoreError(f"Supabase {name}: HTTP {response.status_code} {detail or ''}".strip())
        return response.json() if response.content else None

    def teams(self) -> list[dict[str, Any]]:
        """Squadre note con nome breve e alias (lettura, per l'abbinamento tra provider)."""
        try:
            response = self.http.get(
                f"{self.url}/rest/v1/teams",
                params={"select": "id,name,short_name,team_aliases(alias)", "limit": "5000"},
                headers=self._headers(),
            )
        except httpx.HTTPError as exc:
            raise StoreError(f"Supabase teams: {type(exc).__name__}") from None
        if response.status_code >= 400:
            raise StoreError(f"Supabase teams: HTTP {response.status_code}")
        rows = response.json()
        return rows if isinstance(rows, list) else []

    def succeeded_windows(
        self,
        provider: str,
        job_type: str,
        statuses: tuple[str, ...] = ("SUCCEEDED", "PARTIAL"),
    ) -> set[str]:
        """Chiavi delle esecuzioni concluse (di default SUCCEEDED o PARTIAL)."""
        try:
            response = self.http.get(
                f"{self.url}/rest/v1/ingestion_runs",
                params={
                    "select": "window_key",
                    "provider": f"eq.{provider}",
                    "job_type": f"eq.{job_type}",
                    "status": f"in.({','.join(statuses)})",
                },
                headers=self._headers(),
            )
        except httpx.HTTPError as exc:
            raise StoreError(f"Supabase ingestion_runs: {type(exc).__name__}") from None
        if response.status_code >= 400:
            raise StoreError(f"Supabase ingestion_runs: HTTP {response.status_code}")
        rows = response.json()
        return {str(r["window_key"]) for r in rows if isinstance(r, dict) and r.get("window_key")}

    def last_run(self, provider: str, job_type: str, window_key: str) -> dict[str, Any] | None:
        """Ultima esecuzione di una finestra (stato e cursore di ripresa)."""
        try:
            response = self.http.get(
                f"{self.url}/rest/v1/ingestion_runs",
                params={
                    "select": "status,resume_cursor",
                    "provider": f"eq.{provider}",
                    "job_type": f"eq.{job_type}",
                    "window_key": f"eq.{window_key}",
                    "order": "started_at.desc",
                    "limit": "1",
                },
                headers=self._headers(),
            )
        except httpx.HTTPError as exc:
            raise StoreError(f"Supabase ingestion_runs: {type(exc).__name__}") from None
        if response.status_code >= 400:
            raise StoreError(f"Supabase ingestion_runs: HTTP {response.status_code}")
        rows = response.json()
        return rows[0] if rows else None

    def ingest_details(self, run_id: int, batch: dict[str, Any]) -> dict[str, Any]:
        return self.rpc("ingest_match_details", {"p_run_id": run_id, "p_batch": batch})

    def start_run(self, provider: str, job_type: str, window_key: str, triggered_by: str) -> int:
        return int(
            self.rpc(
                "start_ingestion_run",
                {
                    "p_provider": provider,
                    "p_job_type": job_type,
                    "p_window_key": window_key,
                    "p_triggered_by": triggered_by,
                },
            )
        )

    def ingest(self, run_id: int, batch: dict[str, Any]) -> dict[str, Any]:
        return self.rpc("ingest_football_batch", {"p_run_id": run_id, "p_batch": batch})

    def ingest_odds(self, run_id: int, batch: dict[str, Any]) -> dict[str, Any]:
        return self.rpc("ingest_odds_batch", {"p_run_id": run_id, "p_batch": batch})

    def report_issues(self, run_id: int, issues: list[dict[str, Any]]) -> None:
        if issues:
            self.rpc("report_quality_issues", {"p_run_id": run_id, "p_issues": issues})

    def resolve_issues(
        self, run_id: int, check_codes: tuple[str, ...], provider_entity_ids: list[str]
    ) -> None:
        """Chiude i problemi aperti di questi controlli per le partite indicate (ADR 0034)."""
        for i in range(0, len(provider_entity_ids), 500):
            chunk = provider_entity_ids[i : i + 500]
            self.rpc(
                "resolve_quality_issues",
                {
                    "p_run_id": run_id,
                    "p_check_codes": list(check_codes),
                    "p_provider_entity_ids": chunk,
                },
            )

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
    ) -> None:
        self.rpc(
            "finish_ingestion_run",
            {
                "p_run_id": run_id,
                "p_status": status,
                "p_requests_used": requests_used,
                "p_quota_remaining": quota_remaining,
                "p_rows_upserted": rows_upserted,
                "p_error_count": error_count,
                "p_error_summary": error_summary,
                "p_resume_cursor": resume_cursor,
            },
        )
