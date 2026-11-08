"""Job `odds.collect` (M7 fase A5): quote 1X2 da The Odds API dalla coda.

Il lavoro vero resta in `services/data-collector` (`predictra_collector.odds_runner.run_odds`,
M3, ADR 0015). Il piano gratuito ha 500 crediti al mese e la raccolta ne usa fino a 16 al
giorno: questo adattatore non deve aggiungere nemmeno una chiamata.

- Due finestre al giorno (UTC), come gli schedule precedenti (07:23 e 16:37):
  - `daily` dalle 06:00 alle 15:00: snapshot di tutte le competizioni;
  - `prematch` dalle 15:00 alle 21:00: solo le competizioni con partite nelle 6 ore
    successive, verificate prima con `/events` (gratuito).
  Chiave idempotente `odds.collect:<modo>:<AAAA-MM-GG>`: al massimo una raccolta per modo
  al giorno, anche se il ciclo gira ogni 3 ore. Fuori finestra il job si chiude senza crediti.
- Regola di spesa dei tentativi:
  - crediti già spesi → il job si completa con l'esito parziale e **non** si ritenta;
  - crediti sotto la riserva del client → dead-letter subito (notifica), nessun tentativo;
  - nessun credito speso e tutto fallito (rete, provider) → un solo nuovo tentativo
    (`MAX_ATTEMPTS` = 2), poi dead-letter.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, date, datetime, time
from typing import Any

from predictra_collector.config import ConfigError, parse_competitions
from predictra_collector.odds_runner import run_odds
from predictra_collector.supabase_store import SupabaseStore
from predictra_collector.the_odds_api import OddsApiClient

from .worker import Handler, JobContext, PermanentJobError

JOB_TYPE = "odds.collect"
MAX_ATTEMPTS = 2
# (inizio, fine) della finestra di ogni modo, in ore UTC.
WINDOWS: dict[str, tuple[int, int]] = {"daily": (6, 15), "prematch": (15, 21)}

Collector = Callable[..., Any]


def _window(mode: str, day: date) -> tuple[datetime, datetime]:
    start_h, end_h = WINDOWS[mode]
    return (
        datetime.combine(day, time(start_h), tzinfo=UTC),
        datetime.combine(day, time(end_h), tzinfo=UTC),
    )


def planned_jobs(now: datetime) -> list[tuple[str, str, dict[str, Any], int]]:
    """(tipo, chiave, payload, max_attempts) dei job la cui finestra contiene `now`."""
    now = now.astimezone(UTC)
    jobs = []
    for mode in WINDOWS:
        start, end = _window(mode, now.date())
        if start <= now < end:
            key = f"{JOB_TYPE}:{mode}:{now.date().isoformat()}"
            jobs.append(
                (JOB_TYPE, key, {"mode": mode, "date": now.date().isoformat()}, MAX_ATTEMPTS)
            )
    return jobs


def make_handler(
    env: Mapping[str, str],
    *,
    supabase_url: str,
    supabase_secret_key: str,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
    collector: Collector = run_odds,
) -> Handler:
    def handle(ctx: JobContext) -> dict[str, Any]:
        payload = ctx.job.payload
        mode = payload.get("mode")
        if mode not in WINDOWS:
            raise PermanentJobError("mode deve essere daily o prematch")
        try:
            day = date.fromisoformat(str(payload["date"]))
        except (KeyError, ValueError):
            raise PermanentJobError("date mancante o non valida") from None
        start, end = _window(mode, day)
        current = now()
        if not start <= current < end:
            return {"skipped": "fuori finestra", "mode": mode, "date": day.isoformat()}

        api_key = (env.get("ODDS_API_KEY") or "").strip()
        if not api_key:
            raise PermanentJobError("Variabile ODDS_API_KEY mancante")
        raw = payload.get("competitions")
        if raw is not None and not (isinstance(raw, list) and all(isinstance(c, str) for c in raw)):
            raise PermanentJobError("competitions deve essere un elenco di codici")
        try:
            competitions = parse_competitions(",".join(raw) if raw else None)
        except ConfigError as exc:
            raise PermanentJobError(str(exc)) from None

        client = OddsApiClient(api_key)
        store = SupabaseStore(supabase_url, supabase_secret_key)
        summary = collector(
            client,
            store,
            competitions,
            mode=mode,
            triggered_by="schedule",
            secrets=(api_key, supabase_secret_key),
            now=current,
        )
        statuses = {r.code: r.status for r in summary.results}
        result = {
            "mode": mode,
            "date": day.isoformat(),
            "credits": client.credits_used,
            "remaining": summary.remaining,
            "competitions": statuses,
        }
        failed = [code for code, status in statuses.items() if status == "FAILED"]
        if failed and client.remaining is not None and client.remaining <= client.reserve:
            raise PermanentJobError(
                f"Crediti The Odds API sotto la riserva ({client.remaining} rimasti): "
                "raccolta ferma fino al rinnovo mensile"
            )
        if failed and client.credits_used == 0 and len(failed) == len(statuses):
            # Nulla raccolto e nulla speso: un nuovo tentativo non costa crediti.
            raise RuntimeError(f"Quote non raccolte: {', '.join(failed)}")
        # Crediti già spesi (o nessun errore): esito definitivo, anche se parziale.
        return result

    return handle
