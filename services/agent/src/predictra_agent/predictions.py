"""Job `predictions.run` (M7 fase A5): previsioni del motore M4 dalla coda.

Il lavoro vero resta in `services/prediction-engine` (`predictra_engine.pipeline.run`,
ADR 0020-0022): qui solo l'adattatore alla coda.

- Due finestre al giorno (UTC), come gli schedule precedenti (05:40 e 14:40):
  `morning` dalle 03 alle 12 e `afternoon` dalle 12 alle 21. Nel ciclo il job viene dopo
  la raccolta football-data della stessa finestra (accodata prima, quindi prelevata prima)
  e prima delle proposte del Bet Builder (cicli delle 06:47 e delle 15:47).
  Chiave `predictions.run:<finestra>:<AAAA-MM-GG>`: una esecuzione per finestra.
- Riproducibilità (ADR 0020): la versione del modello dipende da
  `PREDICTION_ENGINE_COMMIT`, l'ultimo commit che ha toccato `services/prediction-engine`,
  calcolato dal workflow come prima.
  Senza un SHA valido il job va in dead-letter: nessuna previsione con versione sbagliata.
- Ogni esecuzione scrive un nuovo insieme di previsioni (tabella immutabile): per questo
  `MAX_ATTEMPTS` = 2 e una finestra già passata si chiude senza eseguire il motore.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from datetime import UTC, date, datetime, time
from typing import Any

from predictra_engine.models import all_models
from predictra_engine.pipeline import run
from predictra_engine.store import SupabaseStore

from .worker import Handler, JobContext, PermanentJobError

JOB_TYPE = "predictions.run"
MAX_ATTEMPTS = 2
HORIZON_DAYS = 7
WINDOWS: dict[str, tuple[int, int]] = {"morning": (3, 12), "afternoon": (12, 21)}
COMMIT_RE = re.compile(r"[0-9a-f]{7,40}")

Engine = Callable[..., Any]


def _window(name: str, day: date) -> tuple[datetime, datetime]:
    start_h, end_h = WINDOWS[name]
    return (
        datetime.combine(day, time(start_h), tzinfo=UTC),
        datetime.combine(day, time(end_h), tzinfo=UTC),
    )


def planned_jobs(now: datetime) -> list[tuple[str, str, dict[str, Any], int]]:
    """(tipo, chiave, payload, max_attempts) del job la cui finestra contiene `now`."""
    now = now.astimezone(UTC)
    jobs = []
    for name in WINDOWS:
        start, end = _window(name, now.date())
        if start <= now < end:
            day = now.date().isoformat()
            payload = {"window": name, "date": day}
            jobs.append((JOB_TYPE, f"{JOB_TYPE}:{name}:{day}", payload, MAX_ATTEMPTS))
    return jobs


def make_handler(
    env: Mapping[str, str],
    *,
    supabase_url: str,
    supabase_secret_key: str,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
    engine: Engine = run,
) -> Handler:
    def handle(ctx: JobContext) -> dict[str, Any]:
        payload = ctx.job.payload
        name = payload.get("window")
        if name not in WINDOWS:
            raise PermanentJobError("window deve essere morning o afternoon")
        try:
            day = date.fromisoformat(str(payload["date"]))
        except (KeyError, ValueError):
            raise PermanentJobError("date mancante o non valida") from None
        start, end = _window(name, day)
        current = now()
        if not start <= current < end:
            return {"skipped": "fuori finestra", "window": name, "date": day.isoformat()}

        commit = (env.get("PREDICTION_ENGINE_COMMIT") or "").strip().lower()
        if not COMMIT_RE.fullmatch(commit):
            raise PermanentJobError(
                "PREDICTION_ENGINE_COMMIT mancante o non valido: serve lo SHA dell'ultimo "
                "commit del motore"
            )

        store = SupabaseStore(supabase_url, supabase_secret_key)
        summary = engine(
            store,
            all_models(),
            now=current,
            code_commit=commit,
            horizon_days=HORIZON_DAYS,
            triggered_by="schedule",
            dry_run=False,
        )
        result = {
            "window": name,
            "date": day.isoformat(),
            "code_commit": commit,
            "training_matches": summary.training_matches,
            "fixtures": summary.fixtures,
            "models": {
                m.key: {"version": m.version, "predictions": m.predictions} for m in summary.models
            },
        }
        if summary.failed:
            errors = [f"{m.key}: {m.error}" for m in summary.models if m.error]
            raise RuntimeError("Previsioni non riuscite: " + "; ".join(errors or ["errore"]))
        return result

    return handle
