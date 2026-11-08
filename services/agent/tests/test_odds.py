"""Job `odds.collect` (fase A5): finestre, una raccolta al giorno per modo, regola dei crediti."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import pytest
from fake_queue import FakeClock, FakeQueue

from predictra_agent import odds
from predictra_agent.worker import CycleConfig, run_cycle

URL = "https://demo.supabase.co"
SECRET = "sb_secret_DEMO_NON_REALE"
ODDS_KEY = "odds_DEMO_NON_REALE"
MORNING = datetime(2026, 11, 9, 6, 47, tzinfo=UTC)
AFTERNOON = datetime(2026, 11, 9, 15, 47, tzinfo=UTC)


@dataclass
class Result:
    code: str
    status: str


@dataclass
class Summary:
    results: list[Result]
    remaining: int | None = None


@dataclass
class FakeCollector:
    """Al posto di `run_odds`: simula esiti e crediti, senza rete."""

    statuses: dict[str, str] = field(default_factory=dict)
    credits_per_success: int = 1
    remaining: int | None = 400
    calls: list[dict[str, Any]] = field(default_factory=list)

    def __call__(self, client: Any, store: Any, competitions: tuple[str, ...], **kw: Any):
        self.calls.append({"competitions": competitions, **kw})
        results = [Result(c, self.statuses.get(c, "SUCCEEDED")) for c in competitions]
        client.credits_used = self.credits_per_success * sum(
            r.status == "SUCCEEDED" for r in results
        )
        client.remaining = self.remaining
        return Summary(results, self.remaining)


def handlers(collector: FakeCollector, now: datetime, env: dict[str, str] | None = None):
    env = {"ODDS_API_KEY": ODDS_KEY} if env is None else env
    return {
        odds.JOB_TYPE: odds.make_handler(
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


def plan(queue: FakeQueue, now: datetime) -> list[int]:
    return [queue.enqueue(t, k, p, max_attempts=m).job_id for t, k, p, m in odds.planned_jobs(now)]


def test_finestre_del_giorno() -> None:
    assert odds.planned_jobs(datetime(2026, 11, 9, 3, 47, tzinfo=UTC)) == []
    assert [k for _, k, _, _ in odds.planned_jobs(MORNING)] == ["odds.collect:daily:2026-11-09"]
    assert [k for _, k, _, _ in odds.planned_jobs(AFTERNOON)] == [
        "odds.collect:prematch:2026-11-09"
    ]
    assert odds.planned_jobs(datetime(2026, 11, 9, 21, 47, tzinfo=UTC)) == []
    _, _, payload, max_attempts = odds.planned_jobs(MORNING)[0]
    assert payload == {"mode": "daily", "date": "2026-11-09"}
    assert max_attempts == 2


def test_una_sola_raccolta_per_modo_al_giorno(queue: FakeQueue) -> None:
    collector = FakeCollector()
    for hour in (6, 9, 12):  # tre cicli nella finestra daily
        now = datetime(2026, 11, 9, hour, 47, tzinfo=UTC)
        plan(queue, now)
        run_cycle(queue, handlers(collector, now), config(), clock=queue.clock)
    assert len(collector.calls) == 1
    assert collector.calls[0]["mode"] == "daily"
    assert collector.calls[0]["triggered_by"] == "schedule"
    assert len(queue.jobs) == 1


def test_ciclo_delle_6_saltato_lo_fa_quello_delle_9(queue: FakeQueue) -> None:
    collector = FakeCollector()
    now = datetime(2026, 11, 9, 9, 47, tzinfo=UTC)
    plan(queue, now)
    run_cycle(queue, handlers(collector, now), config(), clock=queue.clock)
    assert collector.calls[0]["mode"] == "daily"


def test_job_fuori_finestra_chiuso_senza_crediti(queue: FakeQueue) -> None:
    collector = FakeCollector()
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(collector, AFTERNOON), config(), clock=queue.clock)
    assert collector.calls == []
    assert queue.jobs[job_id].status == "done"
    assert queue.jobs[job_id].result == {
        "skipped": "fuori finestra",
        "mode": "daily",
        "date": "2026-11-09",
    }


def test_crediti_gia_spesi_non_si_ritenta(queue: FakeQueue) -> None:
    collector = FakeCollector(statuses={"PL": "FAILED"})
    [job_id] = plan(queue, MORNING)
    summary = run_cycle(queue, handlers(collector, MORNING), config(), clock=queue.clock)
    assert (summary.done, summary.failed) == (1, 0)
    job = queue.jobs[job_id]
    assert job.status == "done"
    assert job.result is not None
    assert job.result["competitions"]["PL"] == "FAILED"
    assert job.result["credits"] == 7


def test_nulla_speso_un_solo_nuovo_tentativo(queue: FakeQueue) -> None:
    collector = FakeCollector(statuses={c: "FAILED" for c in odds.parse_competitions(None)})
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(collector, MORNING), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "failed"
    queue.clock.advance(3600)
    run_cycle(queue, handlers(collector, MORNING), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "dead"
    assert queue.jobs[job_id].attempts == 2
    assert len(collector.calls) == 2


def test_crediti_sotto_la_riserva_dead_subito(queue: FakeQueue) -> None:
    collector = FakeCollector(statuses={"SA": "FAILED"}, remaining=15)
    collector.statuses.update({c: "FAILED" for c in odds.parse_competitions(None)})
    [job_id] = plan(queue, MORNING)
    summary = run_cycle(queue, handlers(collector, MORNING), config(), clock=queue.clock)
    assert summary.dead == 1
    assert "riserva" in (queue.jobs[job_id].last_error or "")
    assert len(collector.calls) == 1


def test_riserva_raggiunta_ma_raccolta_riuscita_non_e_un_errore(queue: FakeQueue) -> None:
    collector = FakeCollector(remaining=15)
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(collector, MORNING), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "done"


def test_prematch_senza_partite_nessun_errore(queue: FakeQueue) -> None:
    collector = FakeCollector(
        statuses={c: "SKIPPED" for c in odds.parse_competitions(None)}, credits_per_success=0
    )
    [job_id] = plan(queue, AFTERNOON)
    run_cycle(queue, handlers(collector, AFTERNOON), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "done"
    assert collector.calls[0]["mode"] == "prematch"


def test_chiave_mancante_va_in_dead(queue: FakeQueue) -> None:
    collector = FakeCollector()
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(collector, MORNING, env={}), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "dead"
    assert "ODDS_API_KEY" in (queue.jobs[job_id].last_error or "")
    assert collector.calls == []


@pytest.mark.parametrize(
    "payload",
    [{}, {"mode": "live", "date": "2026-11-09"}, {"mode": "daily", "date": "ieri"}],
)
def test_payload_non_valido_va_in_dead(queue: FakeQueue, payload: dict[str, Any]) -> None:
    queue.enqueue(odds.JOB_TYPE, "odds.collect:demo", payload, max_attempts=2)
    run_cycle(queue, handlers(FakeCollector(), MORNING), config(), clock=queue.clock)
    assert queue.jobs[1].status == "dead"
