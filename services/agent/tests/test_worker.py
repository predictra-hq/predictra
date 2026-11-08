"""Worker: idempotenza, ripresa dopo un'interruzione, retry, dead-letter, budget."""

from __future__ import annotations

from typing import Any

import pytest
from fake_queue import FakeClock, FakeQueue

from predictra_agent.handlers import HANDLERS
from predictra_agent.queue import LeaseLostError
from predictra_agent.worker import CycleConfig, JobContext, MinutesBudget, run_cycle


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def queue(clock: FakeClock) -> FakeQueue:
    return FakeQueue(clock)


def config(worker: str = "worker-a", **kw: Any) -> CycleConfig:
    base: dict[str, Any] = {"source": "manual", "schedule": "demo", "worker_id": worker}
    base.update(kw)
    return CycleConfig(**base)


class Sink:
    """Gestore idempotente di prova: scrive per chiave del job, come un upsert."""

    def __init__(self) -> None:
        self.rows: dict[str, int] = {}
        self.calls = 0

    def __call__(self, ctx: JobContext) -> dict[str, Any]:
        self.calls += 1
        self.rows[ctx.job.idempotency_key] = ctx.job.attempts
        return {"rows": 1}


def test_ciclo_vuoto_registra_comunque_il_heartbeat(queue: FakeQueue, clock: FakeClock) -> None:
    summary = run_cycle(queue, HANDLERS, config(), clock=clock)
    assert summary.status == "succeeded"
    assert summary.claimed == 0
    assert queue.runs[summary.run_id]["status"] == "succeeded"


def test_selftest_completato(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("agent.selftest.python", "demo:1")
    summary = run_cycle(queue, HANDLERS, config(), clock=clock)
    assert (summary.status, summary.claimed, summary.done) == ("succeeded", 1, 1)
    assert queue.jobs[1].status == "done"
    assert queue.jobs[1].result == {"ok": True, "attempt": 1}
    assert queue.runs[summary.run_id]["jobs_done"] == 1


def test_accodare_due_volte_non_duplica_ne_riesegue(queue: FakeQueue, clock: FakeClock) -> None:
    sink = Sink()
    assert queue.enqueue("demo.sink", "demo.sink:2026-11-08T10").created
    run_cycle(queue, {"demo.sink": sink}, config(), clock=clock)
    again = queue.enqueue("demo.sink", "demo.sink:2026-11-08T10")
    assert (again.created, again.status) == (False, "done")
    run_cycle(queue, {"demo.sink": sink}, config(), clock=clock)
    assert sink.calls == 1
    assert len(queue.jobs) == 1


def test_job_interrotto_ripreso_dopo_il_lease_senza_duplicati(
    queue: FakeQueue, clock: FakeClock
) -> None:
    sink = Sink()
    queue.enqueue("demo.sink", "demo.sink:k")
    # Il worker A preleva e "muore" a metà: ha già scritto, ma non completa il job.
    [job] = queue.claim("worker-a", limit=1, lease_seconds=900, types=["demo.sink"], run_id=1)
    sink(JobContext(job, lambda: None))

    # Lease ancora valido: B non lo prende.
    summary_b = run_cycle(queue, {"demo.sink": sink}, config("worker-b"), clock=clock)
    assert summary_b.claimed == 0

    # Lease scaduto: C lo riprende (secondo tentativo) e lo completa.
    clock.advance(901)
    summary_c = run_cycle(queue, {"demo.sink": sink}, config("worker-c"), clock=clock)
    assert (summary_c.claimed, summary_c.done) == (1, 1)
    assert queue.jobs[1].status == "done"
    assert queue.jobs[1].attempts == 2
    assert sink.rows == {"demo.sink:k": 2}  # una sola riga: il gestore è idempotente

    # A si risveglia: il suo completamento tardivo è rifiutato.
    with pytest.raises(LeaseLostError):
        queue.complete(1, "worker-a", None)


def test_lease_perso_durante_l_esecuzione(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("demo.lento", "demo:lento")

    def lento(ctx: JobContext) -> dict[str, Any]:
        clock.advance(1000)  # più del lease: un altro worker riprende il job
        queue.claim("worker-b", limit=1, lease_seconds=900, types=["demo.lento"], run_id=99)
        return {"ok": True}

    summary = run_cycle(queue, {"demo.lento": lento}, config(time_budget_seconds=5000), clock=clock)
    assert summary.lease_lost == 1
    assert summary.status == "partial"
    assert queue.jobs[1].locked_by == "worker-b"


def test_extend_lease_tiene_il_job(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("demo.lungo", "demo:lungo")

    def lungo(ctx: JobContext) -> dict[str, Any]:
        clock.advance(800)
        ctx.extend_lease()
        clock.advance(800)  # 1.600 s in totale, ma il lease è stato prolungato
        return {"ok": True}

    summary = run_cycle(queue, {"demo.lungo": lungo}, config(time_budget_seconds=5000), clock=clock)
    assert (summary.done, summary.lease_lost) == (1, 0)


def test_retry_con_backoff_poi_dead(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("agent.selftest.python", "demo:retry", {"fail_attempts": 10}, max_attempts=3)

    first = run_cycle(queue, HANDLERS, config(), clock=clock)
    assert (first.status, first.failed, first.dead) == ("partial", 1, 0)
    assert queue.jobs[1].status == "failed"

    # Prima del backoff il job non è prelevabile.
    assert run_cycle(queue, HANDLERS, config(), clock=clock).claimed == 0

    for _ in range(2):
        clock.advance(3600)
        run_cycle(queue, HANDLERS, config(), clock=clock)
    assert queue.jobs[1].status == "dead"
    assert queue.jobs[1].attempts == 3
    assert "fallimento richiesto" in (queue.jobs[1].last_error or "")


def test_selftest_riesce_dopo_i_fallimenti_richiesti(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("agent.selftest.python", "demo:recupero", {"fail_attempts": 1})
    run_cycle(queue, HANDLERS, config(), clock=clock)
    clock.advance(3600)
    summary = run_cycle(queue, HANDLERS, config(), clock=clock)
    assert summary.done == 1
    assert queue.jobs[1].status == "done"


def test_errore_non_recuperabile_va_subito_in_dead(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("agent.selftest.python", "demo:fatale", {"permanent": True})
    summary = run_cycle(queue, HANDLERS, config(), clock=clock)
    assert (summary.failed, summary.dead) == (1, 1)
    assert queue.jobs[1].status == "dead"
    assert queue.jobs[1].attempts == 1


def test_payload_non_valido_e_non_recuperabile(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("agent.selftest.python", "demo:payload", {"fail_attempts": "tre"})
    run_cycle(queue, HANDLERS, config(), clock=clock)
    assert queue.jobs[1].status == "dead"


def test_il_worker_preleva_solo_i_tipi_che_sa_eseguire(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("odds.prematch", "odds.prematch:demo")
    summary = run_cycle(queue, HANDLERS, config(), clock=clock)
    assert summary.claimed == 0
    assert queue.jobs[1].status == "queued"


def test_max_jobs_e_tempo_a_disposizione(queue: FakeQueue, clock: FakeClock) -> None:
    for i in range(5):
        queue.enqueue("agent.selftest.python", f"demo:{i}")
    assert run_cycle(queue, HANDLERS, config(max_jobs=2), clock=clock).done == 2

    def lento(ctx: JobContext) -> None:
        clock.advance(600)

    # Con 1.800 s e lease di 900 s: dopo il primo job (600 s) ne resta spazio per un altro solo.
    summary = run_cycle(
        queue, {"agent.selftest.python": lento}, config(lease_seconds=900), clock=clock
    )
    assert summary.done == 2


def test_errori_senza_segreti(queue: FakeQueue, clock: FakeClock) -> None:
    secret = "sb_secret_DEMO_NON_REALE"
    queue.enqueue("demo.boom", "demo:boom")

    def boom(ctx: JobContext) -> None:
        raise RuntimeError(f"connessione rifiutata con chiave {secret}")

    summary = run_cycle(queue, {"demo.boom": boom}, config(), clock=clock, secrets=(secret,))
    assert secret not in (queue.jobs[1].last_error or "")
    assert "***" in (queue.jobs[1].last_error or "")
    assert all(secret not in e for e in summary.errors)


def test_errore_della_coda_chiude_il_ciclo_come_fallito(queue: FakeQueue, clock: FakeClock) -> None:
    queue.fail_claim = True
    summary = run_cycle(queue, HANDLERS, config(), clock=clock)
    assert summary.status == "failed"
    assert queue.runs[summary.run_id]["status"] == "failed"
    assert "503" in queue.runs[summary.run_id]["error_summary"]


def test_budget_di_minuti_esaurito_salta_il_ciclo(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("agent.selftest.python", "demo:budget")
    queue.quota_used[("github-actions", "month")] = 900
    summary = run_cycle(queue, HANDLERS, config(minutes=MinutesBudget(quota=900)), clock=clock)
    assert summary.budget_exhausted
    assert summary.status == "failed"
    assert summary.claimed == 0
    assert queue.jobs[1].status == "queued"


def test_minuti_contati_con_arrotondamento_e_overhead(queue: FakeQueue, clock: FakeClock) -> None:
    queue.enqueue("demo.lento", "demo:minuti")

    def lento(ctx: JobContext) -> None:
        clock.advance(130)  # 2 min e 10 s → 3 minuti, più 1 di overhead

    run_cycle(queue, {"demo.lento": lento}, config(minutes=MinutesBudget(quota=900)), clock=clock)
    assert queue.quota_used[("github-actions", "month")] == 4
