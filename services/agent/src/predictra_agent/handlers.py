"""Gestori dei job eseguiti dal worker Python.

I job reali di M2-M5 si collegano nella fase A5, uno per PR (piano M7):
- `football-data.collect` (raccolta football-data.org, M2): `football_data.py`;
- `odds.collect` (quote The Odds API, M3): `odds.py`;
- `predictions.run` (previsioni del motore, M4): `predictions.py`;
- `bet-builder.run` (proposte dello Smart Bet Builder, M5): `bet_builder.py`;
- `api-football.details` (statistiche e formazioni API-Football, M2 A3):
  `api_football_details.py`.

Un tipo senza gestore non viene prelevato: resta in coda.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from . import api_football_details, bet_builder, football_data, odds, predictions
from .worker import Handler, JobContext, PermanentJobError


def selftest(ctx: JobContext) -> dict[str, Any]:
    """Job di verifica del ciclo su DEV: non legge né scrive dati.

    Payload facoltativo `{"fail_attempts": n}`: fallisce i primi `n` tentativi, per
    provare su DEV retry, backoff e dead-letter. `{"permanent": true}` fallisce
    subito in modo non recuperabile.
    """
    payload = ctx.job.payload
    if payload.get("permanent"):
        raise PermanentJobError(
            "agent.selftest.python: errore non recuperabile richiesto dal payload"
        )
    fail_attempts = payload.get("fail_attempts", 0)
    if not isinstance(fail_attempts, int) or isinstance(fail_attempts, bool) or fail_attempts < 0:
        raise PermanentJobError("agent.selftest.python: fail_attempts deve essere un intero >= 0")
    if ctx.job.attempts <= fail_attempts:
        raise RuntimeError(
            f"agent.selftest.python: fallimento richiesto (tentativo {ctx.job.attempts})"
        )
    return {"ok": True, "attempt": ctx.job.attempts}


HANDLERS: dict[str, Handler] = {
    "agent.selftest.python": selftest,
}


def build_handlers(
    env: Mapping[str, str], *, supabase_url: str, supabase_secret_key: str
) -> dict[str, Handler]:
    """Tutti i gestori del worker, con la configurazione presa dall'ambiente."""
    return {
        **HANDLERS,
        api_football_details.JOB_TYPE: api_football_details.make_handler(
            env, supabase_url=supabase_url, supabase_secret_key=supabase_secret_key
        ),
        football_data.JOB_TYPE: football_data.make_handler(
            env, supabase_url=supabase_url, supabase_secret_key=supabase_secret_key
        ),
        odds.JOB_TYPE: odds.make_handler(
            env, supabase_url=supabase_url, supabase_secret_key=supabase_secret_key
        ),
        predictions.JOB_TYPE: predictions.make_handler(
            env, supabase_url=supabase_url, supabase_secret_key=supabase_secret_key
        ),
        bet_builder.JOB_TYPE: bet_builder.make_handler(
            env, supabase_url=supabase_url, supabase_secret_key=supabase_secret_key
        ),
    }
