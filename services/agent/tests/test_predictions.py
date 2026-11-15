"""Job `predictions.run` (fase A5): finestre, commit del motore, ordine nel ciclo, tentativi."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fake_queue import FakeClock, FakeQueue

from predictra_agent import football_data, predictions
from predictra_agent.worker import CycleConfig, JobContext, run_cycle

URL = "https://demo.supabase.co"
SECRET = "sb_secret_DEMO_NON_REALE"
COMMIT = "a" * 40
MORNING = datetime(2026, 11, 9, 3, 47, tzinfo=UTC)
AFTERNOON = datetime(2026, 11, 9, 12, 47, tzinfo=UTC)
SERVICES = Path(__file__).resolve().parents[2]


@dataclass
class Model:
    key: str
    version: str
    predictions: int = 30
    error: str | None = None


@dataclass
class Summary:
    training_matches: int = 1200
    fixtures: int = 19
    models: list[Model] = field(default_factory=list)

    @property
    def failed(self) -> bool:
        return any(m.error for m in self.models)


@dataclass
class FakeEngine:
    """Al posto di `predictra_engine.pipeline.run`: nessun calcolo, nessuna rete."""

    error: str | None = None
    calls: list[dict[str, Any]] = field(default_factory=list)

    def __call__(self, store: Any, models: list[Any], **kw: Any) -> Summary:
        self.calls.append({"models": [m.key for m in models], **kw})
        return Summary(
            models=[
                Model("baseline", f"baseline-x-{kw['code_commit'][:7]}"),
                Model("poisson", f"poisson-x-{kw['code_commit'][:7]}", error=self.error),
            ]
        )


def handlers(engine: FakeEngine, now: datetime, env: dict[str, str] | None = None):
    env = {"PREDICTION_ENGINE_COMMIT": COMMIT} if env is None else env
    return {
        predictions.JOB_TYPE: predictions.make_handler(
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
        for t, k, p, m in predictions.planned_jobs(now)
    ]


def test_finestre_del_giorno() -> None:
    assert predictions.planned_jobs(datetime(2026, 11, 9, 0, 47, tzinfo=UTC)) == []
    keys = [k for _, k, _, _ in predictions.planned_jobs(MORNING)]
    assert keys == ["predictions.run:morning:2026-11-09"]
    keys = [k for _, k, _, _ in predictions.planned_jobs(AFTERNOON)]
    assert keys == ["predictions.run:afternoon:2026-11-09"]
    assert predictions.planned_jobs(datetime(2026, 11, 9, 21, 47, tzinfo=UTC)) == []
    assert predictions.planned_jobs(MORNING)[0][3] == 2


def test_una_esecuzione_per_finestra(queue: FakeQueue) -> None:
    engine = FakeEngine()
    for hour in (3, 6, 9):
        now = datetime(2026, 11, 9, hour, 47, tzinfo=UTC)
        plan(queue, now)
        run_cycle(queue, handlers(engine, now), config(), clock=queue.clock)
    assert len(engine.calls) == 1
    call = engine.calls[0]
    assert call["code_commit"] == COMMIT
    assert call["triggered_by"] == "schedule"
    assert call["dry_run"] is False
    assert call["horizon_days"] == 10
    assert "baseline" in call["models"]


def test_previsioni_dopo_la_raccolta_nello_stesso_ciclo(queue: FakeQueue) -> None:
    order: list[str] = []

    def collect(ctx: JobContext) -> dict[str, Any]:
        order.append(ctx.job.type)
        return {}

    engine = FakeEngine()
    predict = handlers(engine, MORNING)[predictions.JOB_TYPE]

    def predict_and_record(ctx: JobContext) -> dict[str, Any] | None:
        order.append(ctx.job.type)
        return predict(ctx)

    job_type, key, payload = football_data.planned_job(MORNING)
    queue.enqueue(job_type, key, payload)
    plan(queue, MORNING)
    run_cycle(
        queue,
        {football_data.JOB_TYPE: collect, predictions.JOB_TYPE: predict_and_record},
        config(),
        clock=queue.clock,
    )
    assert order == ["football-data.collect", "predictions.run"]


def test_risultato_con_versioni(queue: FakeQueue) -> None:
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(FakeEngine(), MORNING), config(), clock=queue.clock)
    result = queue.jobs[job_id].result
    assert result is not None
    assert result["code_commit"] == COMMIT
    assert result["models"]["poisson"] == {"version": "poisson-x-aaaaaaa", "predictions": 30}


@pytest.mark.parametrize("commit", ["", "main", "XYZ1234", "abc"])
def test_code_commit_non_valido_va_in_dead(queue: FakeQueue, commit: str) -> None:
    engine = FakeEngine()
    [job_id] = plan(queue, MORNING)
    run_cycle(
        queue,
        handlers(engine, MORNING, env={"PREDICTION_ENGINE_COMMIT": commit}),
        config(),
        clock=queue.clock,
    )
    assert queue.jobs[job_id].status == "dead"
    assert "PREDICTION_ENGINE_COMMIT" in (queue.jobs[job_id].last_error or "")
    assert engine.calls == []


def test_modello_fallito_un_solo_nuovo_tentativo(queue: FakeQueue) -> None:
    engine = FakeEngine(error="DEMO: matrice singolare")
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(engine, MORNING), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "failed"
    assert "poisson" in (queue.jobs[job_id].last_error or "")
    queue.clock.advance(3600)
    run_cycle(queue, handlers(engine, MORNING), config(), clock=queue.clock)
    assert queue.jobs[job_id].status == "dead"
    assert len(engine.calls) == 2


def test_fuori_finestra_non_esegue_il_motore(queue: FakeQueue) -> None:
    engine = FakeEngine()
    [job_id] = plan(queue, MORNING)
    run_cycle(queue, handlers(engine, AFTERNOON), config(), clock=queue.clock)
    assert engine.calls == []
    assert queue.jobs[job_id].result == {
        "skipped": "fuori finestra",
        "window": "morning",
        "date": "2026-11-09",
    }


@pytest.mark.parametrize("payload", [{}, {"window": "night", "date": "2026-11-09"}])
def test_payload_non_valido_va_in_dead(queue: FakeQueue, payload: dict[str, Any]) -> None:
    queue.enqueue(predictions.JOB_TYPE, "predictions.run:demo", payload, max_attempts=2)
    run_cycle(queue, handlers(FakeEngine(), MORNING), config(), clock=queue.clock)
    assert queue.jobs[1].status == "dead"


def _locked(lock: Path, name: str) -> str:
    match = re.search(rf'name = "{name}"\nversion = "([^"]+)"', lock.read_text(encoding="utf-8"))
    assert match, f"{name} non trovato in {lock}"
    return match.group(1)


@pytest.mark.parametrize("package", ["numpy", "scipy"])
def test_stesse_librerie_del_motore(package: str) -> None:
    """Riproducibilità (ADR 0020): l'agente esegue il motore con le sue stesse versioni."""
    engine = _locked(SERVICES / "prediction-engine" / "uv.lock", package)
    agent = _locked(SERVICES / "agent" / "uv.lock", package)
    assert agent == engine, f"{package}: agente {agent}, motore {engine}; rigenera uv.lock"
