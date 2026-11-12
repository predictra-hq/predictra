"""Job `api-football.details` (ADR 0012): pianificazione giornaliera, errori, risultato."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fake_queue import FakeClock, FakeQueue

from predictra_agent import api_football_details
from predictra_agent.worker import CycleConfig, run_cycle

URL = "https://demo.supabase.co"
SECRET = "sb_secret_DEMO_NON_REALE"
AF_KEY = "af_DEMO_NON_REALE"
NOW = datetime(2026, 11, 12, 0, 47, tzinfo=UTC)


@dataclass
class Season:
    code: str
    year: int
    status: str
    done: int = 20
    total: int = 20


@dataclass
class Summary:
    seasons: list[Season] = field(default_factory=list)
    requests_used: int = 0
    stopped: str | None = None
    complete: bool = False


class FakeCollector:
    def __init__(self, summary: Summary):
        self.summary = summary
        self.calls: list[dict[str, Any]] = []

    def __call__(self, client: Any, store: Any, competitions: tuple[str, ...], **kw: Any):
        self.calls.append({"competitions": competitions, **kw})
        return self.summary


def handlers(collector: FakeCollector, env: dict[str, str] | None = None):
    env = {"API_FOOTBALL_KEY": AF_KEY} if env is None else env
    return {
        api_football_details.JOB_TYPE: api_football_details.make_handler(
            env, supabase_url=URL, supabase_secret_key=SECRET, collector=collector
        )
    }


def config() -> CycleConfig:
    return CycleConfig(source="github_actions", schedule="agent-python", worker_id="gha-demo")


@pytest.fixture
def queue() -> FakeQueue:
    return FakeQueue(FakeClock())


def plan(queue: FakeQueue, now: datetime = NOW) -> int:
    job_type, key, payload, attempts = api_football_details.planned_job(now)
    return queue.enqueue(job_type, key, payload, max_attempts=attempts).job_id


def test_un_job_al_giorno(queue: FakeQueue) -> None:
    job_type, key, payload, attempts = api_football_details.planned_job(NOW)
    assert (job_type, key, payload, attempts) == (
        "api-football.details",
        "api-football.details:2026-11-12",
        {"date": "2026-11-12"},
        2,
    )
    plan(queue)
    plan(queue, NOW + timedelta(hours=9))
    assert len(queue.jobs) == 1
    plan(queue, NOW + timedelta(days=1))
    assert len(queue.jobs) == 2


def test_dettagli_dalla_coda(queue: FakeQueue) -> None:
    collector = FakeCollector(
        Summary([Season("SA", 2022, "PARTIAL", 4, 20)], requests_used=6, stopped="Budget")
    )
    job_id = plan(queue)
    summary = run_cycle(queue, handlers(collector), config(), clock=queue.clock)
    assert (summary.done, summary.failed) == (1, 0)
    call = collector.calls[0]
    assert call["competitions"] == ("SA", "PL", "PD", "BL1", "FL1", "DED", "PPL", "CL")
    assert call["secrets"] == (AF_KEY, SECRET)
    result = queue.jobs[job_id].result
    assert result is not None and result["seasons"] == {"SA:2022": "PARTIAL 4/20"}


def test_chiave_mancante_va_in_dead_letter(queue: FakeQueue) -> None:
    job_id = plan(queue)
    run_cycle(queue, handlers(FakeCollector(Summary()), env={}), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "dead"


def test_stagione_fallita_ritenta(queue: FakeQueue) -> None:
    job_id = plan(queue)
    collector = FakeCollector(Summary([Season("PL", 2023, "FAILED")]))
    run_cycle(queue, handlers(collector), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "failed"


def test_limite_del_piano_non_ritenta(queue: FakeQueue) -> None:
    job_id = plan(queue)
    collector = FakeCollector(
        Summary(
            [Season("SA", 2024, "FAILED")],
            stopped="Limite del piano API-Football: ApiFootballError: plan",
        )
    )
    run_cycle(queue, handlers(collector), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "dead"
