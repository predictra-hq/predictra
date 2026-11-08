"""Job `football-data.collect` (M7 fase A5): raccolta football-data.org dalla coda.

Il lavoro vero resta in `services/data-collector` (`predictra_collector.run`, M2): qui
solo l'adattatore alla coda.

- Una finestra ogni 3 ore, come lo schedule precedente: chiave idempotente
  `football-data.collect:<AAAA-MM-GG>T<HH>` (HH = 00, 03, … UTC). Accodare due volte la
  stessa finestra non crea un secondo job.
- Una finestra già superata (per esempio dopo un ciclo saltato da GitHub) si chiude
  senza chiamare il provider: la finestra successiva raccoglie comunque tutto.
- La scrittura è idempotente (upsert delle RPC di M2): un job ripreso dopo un lease
  scaduto non duplica partite né classifiche.
- Chiave del provider mancante o payload non valido → errore non recuperabile (dead-letter
  con notifica); competizioni fallite → errore recuperabile (nuovo tentativo con backoff).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from predictra_collector.config import ConfigError, parse_competitions
from predictra_collector.football_data import FootballDataClient
from predictra_collector.runner import run
from predictra_collector.supabase_store import SupabaseStore

from .worker import Handler, JobContext, PermanentJobError

JOB_TYPE = "football-data.collect"
WINDOW = timedelta(hours=3)

Collector = Callable[..., Any]


def window_start(now: datetime) -> datetime:
    """Inizio della finestra di 3 ore (UTC) che contiene `now`."""
    now = now.astimezone(UTC)
    return now.replace(hour=now.hour - now.hour % 3, minute=0, second=0, microsecond=0)


def planned_job(now: datetime) -> tuple[str, str, dict[str, Any]]:
    """(tipo, chiave idempotente, payload) del job della finestra corrente."""
    start = window_start(now)
    return JOB_TYPE, f"{JOB_TYPE}:{start:%Y-%m-%dT%H}", {"window_start": start.isoformat()}


def make_handler(
    env: Mapping[str, str],
    *,
    supabase_url: str,
    supabase_secret_key: str,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
    collector: Collector = run,
) -> Handler:
    def handle(ctx: JobContext) -> dict[str, Any]:
        payload = ctx.job.payload
        try:
            start = datetime.fromisoformat(str(payload["window_start"]))
        except (KeyError, ValueError):
            raise PermanentJobError("window_start mancante o non valido") from None
        if start.tzinfo is None:
            raise PermanentJobError("window_start senza fuso orario")
        if now() - start >= WINDOW:
            return {"skipped": "finestra superata", "window_start": start.isoformat()}

        api_key = (env.get("FOOTBALL_DATA_API_KEY") or "").strip()
        if not api_key:
            raise PermanentJobError("Variabile FOOTBALL_DATA_API_KEY mancante")
        raw = payload.get("competitions")
        if raw is not None and not (isinstance(raw, list) and all(isinstance(c, str) for c in raw)):
            raise PermanentJobError("competitions deve essere un elenco di codici")
        try:
            competitions = parse_competitions(",".join(raw) if raw else None)
        except ConfigError as exc:
            raise PermanentJobError(str(exc)) from None

        client = FootballDataClient(api_key)
        store = SupabaseStore(supabase_url, supabase_secret_key)
        summary = collector(
            client,
            store,
            competitions,
            triggered_by="schedule",
            secrets=(api_key, supabase_secret_key),
        )
        result = {
            "window_start": start.isoformat(),
            "requests": client.requests_used,
            "competitions": {r.code: r.status for r in summary.results},
        }
        failed = [r.code for r in summary.results if r.status == "FAILED"]
        if failed:
            raise RuntimeError(f"Competizioni non raccolte: {', '.join(failed)}")
        return result

    return handle
