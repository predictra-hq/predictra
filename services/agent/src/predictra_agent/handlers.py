"""Gestori dei job eseguiti dal worker Python.

I job reali di M2-M5 (raccolta football-data.org, quote, previsioni, proposte) si
collegano nella fase A5, uno per PR (piano M7). Finché non sono qui, il worker
non li preleva: la coda li lascia ad altri worker o in attesa.
"""

from __future__ import annotations

from typing import Any

from .worker import Handler, JobContext, PermanentJobError


def selftest(ctx: JobContext) -> dict[str, Any]:
    """Job di verifica del ciclo su DEV: non legge né scrive dati.

    Payload facoltativo `{"fail_attempts": n}`: fallisce i primi `n` tentativi, per
    provare su DEV retry, backoff e dead-letter. `{"permanent": true}` fallisce
    subito in modo non recuperabile.
    """
    payload = ctx.job.payload
    if payload.get("permanent"):
        raise PermanentJobError("agent.selftest: errore non recuperabile richiesto dal payload")
    fail_attempts = payload.get("fail_attempts", 0)
    if not isinstance(fail_attempts, int) or isinstance(fail_attempts, bool) or fail_attempts < 0:
        raise PermanentJobError("agent.selftest: fail_attempts deve essere un intero >= 0")
    if ctx.job.attempts <= fail_attempts:
        raise RuntimeError(f"agent.selftest: fallimento richiesto (tentativo {ctx.job.attempts})")
    return {"ok": True, "attempt": ctx.job.attempts}


HANDLERS: dict[str, Handler] = {
    "agent.selftest": selftest,
}
