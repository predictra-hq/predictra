"""Job `api-football.details` (M2 fase A3, ADR 0012): statistiche e formazioni dalla coda.

Il lavoro vero resta in `services/data-collector` (`collect_details`): qui solo
l'adattatore alla coda.

- Un job al giorno (chiave `api-football.details:<AAAA-MM-GG>`), accodato insieme alla
  raccolta football-data.org quando `API_FOOTBALL_KEY` è presente.
- Ogni job usa il budget del giorno di API-Football (90 richieste, contando quelle già
  usate) e riprende dal punto in cui si era fermato il giorno prima. Quando tutte le
  stagioni sono complete, il job si chiude senza chiamare il provider (solo `/status`,
  gratuito).
- Prima dei dettagli, la correzione dello storico (ADR 0034): riscarica i risultati
  2022-2024 con la normalizzazione attuale, una volta sola (32 richieste), poi non costa
  più nulla. Va prima perché i dettagli usano tutto il budget del giorno.
- Chiave mancante o limite del piano → errore non recuperabile; stagione fallita → un solo
  nuovo tentativo.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any

from predictra_collector.api_football import ApiFootballClient
from predictra_collector.api_football_backfill import backfill
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


# Runner ospitati da GitHub: IP di uscita condivisi con migliaia di altri utenti su Azure.
# API-SPORTS sospende i piani Free che chiamano da IP condivisi (controlli multi-account,
# ADR 0069), anche con poche richieste: da lì API-Football non si chiama mai.
SHARED_RUNNER = "github-hosted"


def egress_allowed(env: Mapping[str, str]) -> bool:
    """Vero se le chiamate partono da un IP non condiviso (runner self-hosted o PC proprio)."""
    return (env.get("RUNNER_ENVIRONMENT") or "").strip() != SHARED_RUNNER


def is_suspended(exc: BaseException) -> bool:
    """Risposta «Your account is suspended»: riprovare non serve e peggiora le cose."""
    return "suspended" in str(exc).lower()


def make_handler(
    env: Mapping[str, str],
    *,
    supabase_url: str,
    supabase_secret_key: str,
    collector: Collector = collect_details,
    rescorer: Collector = backfill,
) -> Handler:
    def handle(ctx: JobContext) -> dict[str, Any]:
        key = (env.get("API_FOOTBALL_KEY") or "").strip()
        if not key:
            raise PermanentJobError("Variabile API_FOOTBALL_KEY mancante")
        if not egress_allowed(env):
            raise PermanentJobError(
                "API-Football non si chiama dai runner di GitHub: IP condivisi (ADR 0069)"
            )
        try:
            return _collect(key)
        except PermanentJobError:
            raise
        except Exception as exc:
            if is_suspended(exc):
                # Nessun nuovo tentativo: un account sospeso non va sollecitato.
                raise PermanentJobError(f"Account API-Football sospeso: {exc}") from exc
            raise

    def _collect(key: str) -> dict[str, Any]:
        store = SupabaseStore(supabase_url, supabase_secret_key)
        first = ApiFootballClient(key)
        rescore = rescorer(
            first,
            store,
            V1_COMPETITIONS,
            triggered_by="schedule",
            secrets=(key, supabase_secret_key),
            refresh=True,
        )
        # Client nuovo: il budget dei dettagli si ricalcola da /status, già aggiornato. Le
        # chiamate rimaste nel minuto passano dal primo client al secondo, altrimenti il
        # secondo partirebbe senza aspettare e potrebbe superare il limite al minuto.
        client = ApiFootballClient(key)
        client.minute_remaining = first.minute_remaining
        summary = collector(
            client,
            store,
            V1_COMPETITIONS,
            triggered_by="schedule",
            secrets=(key, supabase_secret_key),
        )
        result = {
            "rescore": {
                "requests": rescore.requests_used,
                "seasons": [f"{r.code}:{r.year} {r.status}" for r in rescore.results],
                "stopped": rescore.stopped,
            },
            "requests": summary.requests_used,
            "complete": summary.complete,
            "stopped": summary.stopped,
            "seasons": {
                f"{s.code}:{s.year}": f"{s.status} {s.done}/{s.total}" for s in summary.seasons
            },
        }
        failed = [f"{s.code}:{s.year}" for s in summary.seasons if s.status == "FAILED"]
        if summary.stopped and summary.stopped.startswith("Limite del piano"):
            # Ritentare darebbe lo stesso errore e consumerebbe richieste.
            raise PermanentJobError(summary.stopped)
        if failed:
            raise RuntimeError(f"Stagioni non completate: {', '.join(failed)}")
        return result

    return handle
