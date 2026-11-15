"""Job `football-data.collect` (fase A5): pianificazione, finestre, errori, idempotenza."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fake_queue import FakeClock, FakeQueue

from predictra_agent import football_data
from predictra_agent.worker import CycleConfig, run_cycle

URL = "https://demo.supabase.co"
SECRET = "sb_secret_DEMO_NON_REALE"
FD_KEY = "fd_DEMO_NON_REALE"
NOW = datetime(2026, 11, 8, 19, 47, tzinfo=UTC)


@dataclass
class Result:
    code: str
    status: str


@dataclass
class Summary:
    results: list[Result]


class FakeCollector:
    """Al posto di `predictra_collector.run`: registra le chiamate, non usa la rete."""

    def __init__(self, statuses: dict[str, str] | None = None, error: str | None = None):
        self.calls: list[dict[str, Any]] = []
        self.statuses = statuses or {}
        self.error = error

    def __call__(self, client: Any, store: Any, competitions: tuple[str, ...], **kw: Any):
        self.calls.append({"competitions": competitions, **kw})
        if self.error:
            raise RuntimeError(self.error)
        return Summary([Result(c, self.statuses.get(c, "SUCCEEDED")) for c in competitions])


def handlers(collector: FakeCollector, env: dict[str, str] | None = None, now: datetime = NOW):
    env = {"FOOTBALL_DATA_API_KEY": FD_KEY} if env is None else env
    return {
        football_data.JOB_TYPE: football_data.make_handler(
            env,
            supabase_url=URL,
            supabase_secret_key=SECRET,
            now=lambda: now,
            collector=collector,
        )
    }


def config() -> CycleConfig:
    return CycleConfig(source="github_actions", schedule="agent-python", worker_id="gha-demo")


@pytest.fixture
def queue() -> FakeQueue:
    return FakeQueue(FakeClock())


def plan(queue: FakeQueue, now: datetime = NOW) -> int:
    job_type, key, payload = football_data.planned_job(now)
    return queue.enqueue(job_type, key, payload).job_id


def test_finestre_di_tre_ore_in_utc() -> None:
    assert football_data.window_start(NOW) == datetime(2026, 11, 8, 18, tzinfo=UTC)
    assert football_data.window_start(datetime(2026, 11, 8, 0, 0, tzinfo=UTC)).hour == 0
    rome = datetime(2026, 11, 9, 1, 30, tzinfo=UTC).astimezone()
    assert football_data.window_start(rome) == datetime(2026, 11, 9, 0, tzinfo=UTC)
    job_type, key, payload = football_data.planned_job(NOW)
    assert job_type == "football-data.collect"
    assert key == "football-data.collect:2026-11-08T18"
    assert payload == {"window_start": "2026-11-08T18:00:00+00:00"}


def test_pianificare_due_volte_la_stessa_finestra_non_duplica(queue: FakeQueue) -> None:
    plan(queue)
    plan(queue, NOW + timedelta(minutes=30))
    assert len(queue.jobs) == 1
    plan(queue, NOW + timedelta(hours=1))  # 20:47: ancora la finestra delle 18
    assert len(queue.jobs) == 1
    plan(queue, NOW + timedelta(hours=2))  # 21:47 → finestra 21
    assert len(queue.jobs) == 2


def test_raccolta_dalla_coda(queue: FakeQueue) -> None:
    collector = FakeCollector()
    job_id = plan(queue)
    summary = run_cycle(queue, handlers(collector), config(), clock=queue.clock)
    assert (summary.done, summary.failed) == (1, 0)
    assert queue.jobs[job_id].status == "done"
    call = collector.calls[0]
    assert call["triggered_by"] == "schedule"
    assert call["competitions"] == ("SA", "PL", "PD", "BL1", "FL1", "DED", "PPL", "CL")
    assert call["secrets"] == (FD_KEY, SECRET)
    assert queue.jobs[job_id].result is not None
    assert queue.jobs[job_id].result["competitions"]["SA"] == "SUCCEEDED"


def test_rieseguire_la_finestra_non_chiama_due_volte(queue: FakeQueue) -> None:
    collector = FakeCollector()
    plan(queue)
    run_cycle(queue, handlers(collector), config(), clock=queue.clock)
    plan(queue)  # ciclo successivo nella stessa finestra
    run_cycle(queue, handlers(collector), config(), clock=queue.clock)
    assert len(collector.calls) == 1


def test_finestra_superata_chiusa_senza_chiamate(queue: FakeQueue) -> None:
    collector = FakeCollector()
    job_id = plan(queue, NOW - timedelta(hours=3))  # finestra 15-18, ora sono le 19:47
    summary = run_cycle(queue, handlers(collector), config(), clock=queue.clock)
    assert summary.done == 1
    assert collector.calls == []
    assert queue.jobs[job_id].result == {
        "skipped": "finestra superata",
        "window_start": "2026-11-08T15:00:00+00:00",
    }


def test_chiave_mancante_va_in_dead(queue: FakeQueue) -> None:
    collector = FakeCollector()
    job_id = plan(queue)
    summary = run_cycle(queue, handlers(collector, env={}), config(), clock=queue.clock)
    assert summary.dead == 1
    assert queue.jobs[job_id].status == "dead"
    assert "FOOTBALL_DATA_API_KEY" in (queue.jobs[job_id].last_error or "")
    assert collector.calls == []


@pytest.mark.parametrize(
    "payload",
    [{}, {"window_start": "ieri"}, {"window_start": "2026-11-08T18:00:00"}],
)
def test_payload_non_valido_va_in_dead(queue: FakeQueue, payload: dict[str, Any]) -> None:
    queue.enqueue(football_data.JOB_TYPE, "football-data.collect:demo", payload)
    run_cycle(queue, handlers(FakeCollector()), config(), clock=queue.clock)
    assert queue.jobs[1].status == "dead"


def test_competizioni_non_previste_vanno_in_dead(queue: FakeQueue) -> None:
    _, key, payload = football_data.planned_job(NOW)
    queue.enqueue(football_data.JOB_TYPE, key, {**payload, "competitions": ["XX"]})
    run_cycle(queue, handlers(FakeCollector()), config(), clock=queue.clock)
    assert queue.jobs[1].status == "dead"


def test_competizione_fallita_si_ritenta(queue: FakeQueue) -> None:
    collector = FakeCollector(statuses={"PL": "FAILED"})
    job_id = plan(queue)
    summary = run_cycle(queue, handlers(collector), config(), clock=queue.clock)
    assert (summary.failed, summary.dead) == (1, 0)
    assert queue.jobs[job_id].status == "failed"
    assert "PL" in (queue.jobs[job_id].last_error or "")


def test_errori_senza_segreti(queue: FakeQueue) -> None:
    collector = FakeCollector(error=f"rifiutato {FD_KEY} {SECRET}")
    job_id = plan(queue)
    summary = run_cycle(
        queue, handlers(collector), config(), clock=queue.clock, secrets=(SECRET, FD_KEY)
    )
    error = queue.jobs[job_id].last_error or ""
    assert FD_KEY not in error and SECRET not in error
    assert all(FD_KEY not in e and SECRET not in e for e in summary.errors)
