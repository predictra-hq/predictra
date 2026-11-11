"""Job `api-football.details` (M2 fase A3, ADR 0012): statistiche e formazioni dalla coda.

Il lavoro vero resta in `services/data-collector` (`collect_details`): qui solo
l'adattatore alla coda.

- Un job al giorno (chiave `api-football.details:<AAAA-MM-GG>`), accodato insieme alla
  raccolta football-data.org quando `API_FOOTBALL_KEY` è presente.
- Ogni job usa il budget del giorno di API-Football (90 richieste, contando quelle già
  usate) e riprende dal punto in cui si era fermato il giorno prima. Quando tutte le
  stagioni sono complete, il job si chiude senza chiamare il provider (solo `/status`,
  gratuito).
- Chiave mancante → errore non recuperabile; stagione fallita → un solo nuovo tentativo.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any

from predictra_collector.api_football import ApiFootballClient
from predictra_collector.api_football_details import collect_details
from predictra_collector.config import V1_COMPETITIONS
from predictra_collector.supabase_store import SupabaseStore

from .worker import Handler, JobContext, PermanentJobError

JOB_TYPE = "api-football.details"
MAX_ATTEMPTS = 2

Collector = Callable[..., Any]


def planned_job(now: datetime) -> tuple[str, str, dict[str, Any], int]:
    day = now.astimezone(UTC).date().isoformat()
    return JOB_TYPE, f"{JOB_TYPE}:{day}", {"date": day}, MAX_ATTEMPTS


def make_handler(
    env: Mapping[str, str],
    *,
    supabase_url: str,
    supabase_secret_key: str,
    collector: Collector = collect_details,
) -> Handler:
    def handle(ctx: JobContext) -> dict[str, Any]:
        key = (env.get("API_FOOTBALL_KEY") or "").strip()
        if not key:
            raise PermanentJobError("Variabile API_FOOTBALL_KEY mancante")
        client = ApiFootballClient(key)
        store = SupabaseStore(supabase_url, supabase_secret_key)
        summary = collector(
            client,
            store,
            V1_COMPETITIONS,
            triggered_by="schedule",
            secrets=(key, supabase_secret_key),
        )
        result = {
            "requests": summary.requests_used,
            "complete": summary.complete,
            "stopped": summary.stopped,
            "seasons": {
                f"{s.code}:{s.year}": f"{s.status} {s.chunks_done}/{s.chunks_total}"
                for s in summary.seasons
            },
        }
        failed = [f"{s.code}:{s.year}" for s in summary.seasons if s.status == "FAILED"]
        if failed:
            raise RuntimeError(f"Stagioni non completate: {', '.join(failed)}")
        return result

    return handle
