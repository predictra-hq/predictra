"""Job `bet-builder.run` (fase A5): finestre, ordine dopo le quote, commit, nessun modello."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import pytest
from fake_queue import FakeClock, FakeQueue

from predictra_agent import bet_builder, odds, predictions
from predictra_agent.worker import CycleConfig, JobContext, run_cycle

URL = "https://demo.supabase.co"
SECRET = "sb_secret_DEMO_NON_REALE"
COMMIT = "b" * 40
MORNING = datetime(2026, 11, 9, 6, 47, tzinfo=UTC)
EVENING = datetime(2026, 11, 9, 15, 47, tzinfo=UTC)


@dataclass
class Summary:
    model_version_id: int | None = 7
    fixtures: int = 19
    legs: int = 40
    candidates: int = 300
    proposals: list[Any] = field(default_factory=list)
    run_id: int | None = 11
    written: int = 0
    skipped_reason: str | None = None


@dataclass
class FakeEngine:
    """Al posto di `predictra_bet_builder.pipeline.run`: nessun calcolo, nessuna rete."""

    skipped_reason: str | None = None
    error: str | None = None
    calls: list[dict[str, Any]] = field(default_factory=list)

    def __call__(self, store: Any, rules: Any, **kw: Any) -> Summary:
        self.calls.append({"rules": rules, **kw})
        if self.error:
            raise RuntimeError(self.error)
        if self.skipped_reason:
            return Summary(model_version_id=None, run_id=None, skipped_reason=self.skipped_reason)
        return Summary(proposals=["p1", "p2"], written=2)


def handlers(engine: FakeEngine, now: datetime, env: dict[str, str] | None = None):
    env = {"BET_BUILDER_COMMIT": COMMIT} if env is None else env
    return {
        bet_builder.JOB_TYPE: bet_builder.make_handler(
            env, supabase_url=URL, supabase_secret_key=SECRET, now=lambda: now, engine=engine
        )
    }


def config() -> CycleConfig:
    return CycleConfig(source="github_actions", schedule="agent-python", worker_id="gha-demo")


@pytest.fixture
def queue() -> FakeQueue:
    return FakeQueue(FakeClock())


def plan(queue: FakeQueue, now: datetime) -> list[int]:
    return [
        queue.enqueue(t, k, p, max_attempts=m).job_id
        for t, k, p, m in bet_builder.planned_jobs(now)
    ]


def test_finestre_allineate_alle_quote() -> None:
    assert bet_builder.planned_jobs(datetime(2026, 11, 9, 3, 47, tzinfo=UTC)) == []
    assert [k for _, k, _, _ in bet_builder.planned_jobs(MORNING)] == [
        "bet-builder.run:morning:2026-11-09"
    ]
    assert [k for _, k, _, _ in bet_builder.planned_jobs(EVENING)] == [
        "bet-builder.run:evening:2026-11-09"
    ]
    assert bet_builder.planned_jobs(datetime(2026, 11, 9, 21, 47, tzinfo=UTC)) == []
    # Stesse finestre delle quote: le proposte partono nel ciclo che raccoglie le quote.
    assert {
        "morning": odds.WINDOWS["daily"],
        "evening": odds.WINDOWS["prematch"],
    } == bet_builder.WINDOWS


def test_una_esecuzione_per_finestra(queue: FakeQueue) -> None:
    engine = FakeEngine()
    for hour in (6, 9, 12):
        now = datetime(2026, 11, 9, hour, 47, tzinfo=UTC)
        plan(queue, now)
        run_cycle(queue, handlers(engine, now), config(), clock=queue.clock)
    assert len(engine.calls) == 1
    call = engine.calls[0]
    assert call["code_commit"] == COMMIT
    assert call["triggered_by"] == "schedule"
    assert call["dry_run"] is False
    assert call["horizon_days"] == 7


def test_proposte_dopo_quote_e_previsioni(queue: FakeQueue) -> None:
    order: list[str] = []

    def record(ctx: JobContext) -> dict[str, Any]:
        order.append(ctx.job.type)
        return {}

    # Stesso ordine del ciclo: quote, previsioni (finestra morning 03-12), proposte.
    for t, k, p, m in odds.planned_jobs(MORNING) + predictions.planned_jobs(MORNING):
        queue.enqueue(t, k, p, max_attempts=m)
    plan(queue, MORNING)
    run_cycle(
        queue,
        {odds.JOB_TYPE: record, predictions.JOB_TYPE: record, bet_builder.JOB_TYPE: record},
        config(),
        clock=queue.clock,
    )
    assert order == ["odds.collect", "predictions.run", "bet-builder.run"]


def test_risultato_con_run_e_proposte(queue: FakeQueue) -> None:
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(FakeEngine(), MORNING), config(), clock=queue.clock)
    assert queue.jobs[job_id].result == {
        "window": "morning",
        "date": "2026-11-09",
        "code_commit": COMMIT,
        "run_id": 11,
        "model_version_id": 7,
        "fixtures": 19,
        "candidates": 300,
        "proposals": 2,
        "written": 2,
    }


def test_senza_modello_attivo_si_completa_e_lo_dichiara(queue: FakeQueue) -> None:
    [job_id] = plan(queue, MORNING)
    summary = run_cycle(
        queue,
        handlers(FakeEngine(skipped_reason="nessun modello attivo"), MORNING),
        config(),
        clock=queue.clock,
    )
    assert (summary.done, summary.failed) == (1, 0)
    result = queue.jobs[job_id].result
    assert result is not None
    assert result["skipped"] == "nessun modello attivo"


@pytest.mark.parametrize("commit", ["", "dev", "abc"])
def test_commit_non_valido_va_in_dead(queue: FakeQueue, commit: str) -> None:
    engine = FakeEngine()
    [job_id] = plan(queue, MORNING)
    run_cycle(
        queue,
        handlers(engine, MORNING, env={"BET_BUILDER_COMMIT": commit}),
        config(),
        clock=queue.clock,
    )
    assert queue.jobs[job_id].status == "dead"
    assert "BET_BUILDER_COMMIT" in (queue.jobs[job_id].last_error or "")
    assert engine.calls == []


def test_non_usa_il_commit_del_motore_previsioni(queue: FakeQueue) -> None:
    """Le due versioni restano separate: il commit delle previsioni non basta."""
    engine = FakeEngine()
    [job_id] = plan(queue, MORNING)
    env = {"PREDICTION_ENGINE_COMMIT": "a" * 40, "CODE_COMMIT": "a" * 40}
    run_cycle(queue, handlers(engine, MORNING, env=env), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "dead"
    assert engine.calls == []


def test_errore_del_motore_un_solo_nuovo_tentativo(queue: FakeQueue) -> None:
    engine = FakeEngine(error="DEMO: quote non disponibili")
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(engine, MORNING), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "failed"
    queue.clock.advance(3600)
    run_cycle(queue, handlers(engine, MORNING), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "dead"
    assert len(engine.calls) == 2


def test_fuori_finestra_non_esegue_il_motore(queue: FakeQueue) -> None:
    engine = FakeEngine()
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(engine, EVENING), config(), clock=queue.clock)
    assert engine.calls == []
    assert queue.jobs[job_id].result == {
        "skipped": "fuori finestra",
        "window": "morning",
        "date": "2026-11-09",
    }
