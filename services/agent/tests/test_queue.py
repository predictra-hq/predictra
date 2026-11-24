"""Client RPC: parametri inviati, errori, nessuna chiave nei messaggi."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from predictra_agent.__main__ import default_worker_id, main
from predictra_agent.queue import LeaseLostError, QueueError, SupabaseQueue

KEY = "sb_secret_DEMO_NON_REALE"


def make_queue(handler: Any) -> tuple[SupabaseQueue, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def transport(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    client = httpx.Client(transport=httpx.MockTransport(transport))
    return SupabaseQueue("https://demo.supabase.co", KEY, client), seen


def test_claim_invia_i_parametri_e_legge_i_job() -> None:
    row = {
        "id": 7,
        "type": "agent.selftest.python",
        "idempotency_key": "demo:7",
        "payload": {"a": 1},
        "attempts": 1,
        "max_attempts": 5,
    }
    queue, seen = make_queue(lambda r: httpx.Response(200, json=[row]))
    jobs = queue.claim("w", limit=1, lease_seconds=900, types=["agent.selftest.python"], run_id=3)
    assert jobs[0].id == 7 and jobs[0].payload == {"a": 1}
    request = seen[0]
    assert request.url.path == "/rest/v1/rpc/claim_agent_jobs"
    assert request.headers["apikey"] == KEY
    assert "authorization" not in request.headers
    assert json.loads(request.content) == {
        "p_worker_id": "w",
        "p_limit": 1,
        "p_lease_seconds": 900,
        "p_types": ["agent.selftest.python"],
        "p_run_id": 3,
    }


def test_enqueue_restituisce_se_creato() -> None:
    queue, _ = make_queue(
        lambda r: httpx.Response(200, json=[{"job_id": 4, "created": False, "status": "done"}])
    )
    result = queue.enqueue("agent.selftest.python", "demo:4")
    assert (result.job_id, result.created, result.status) == (4, False, "done")


def test_lease_perso_diventa_lease_lost_error() -> None:
    queue, _ = make_queue(
        lambda r: httpx.Response(400, json={"code": "55000", "message": "lease perso"})
    )
    with pytest.raises(LeaseLostError):
        queue.complete(1, "w", None)


def test_errori_http_senza_chiave() -> None:
    queue, _ = make_queue(lambda r: httpx.Response(401, json={"message": "Invalid API key"}))
    with pytest.raises(QueueError) as info:
        queue.start_run("manual", "demo", "w")
    assert KEY not in str(info.value)
    assert "401" in str(info.value)


def test_errore_di_rete_senza_dettagli() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"fallito con {KEY}")

    queue, _ = make_queue(boom)
    with pytest.raises(QueueError) as info:
        queue.consume_quota("github-actions", "month", 900, 1)
    assert KEY not in str(info.value)


def test_chiave_legacy_anche_in_authorization() -> None:
    queue = SupabaseQueue("https://demo.supabase.co", "eyJDEMO")
    assert queue._headers()["Authorization"] == "Bearer eyJDEMO"


def test_worker_id_da_github_actions() -> None:
    assert default_worker_id({"GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "2"}) == "gha-123-2"


def test_configurazione_mancante(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["cycle"], env={}) == 2
    assert "SUPABASE_SECRET_KEY" in capsys.readouterr().err


def test_payload_non_valido(capsys: pytest.CaptureFixture[str]) -> None:
    env = {"SUPABASE_URL": "https://demo.supabase.co", "SUPABASE_SECRET_KEY": KEY}
    code = main(
        ["enqueue", "--type", "agent.selftest.python", "--key", "k", "--payload", "[1]"], env=env
    )
    assert code == 2
    assert KEY not in capsys.readouterr().err


def test_watchdog_chiama_la_rpc() -> None:
    queue, seen = make_queue(lambda r: httpx.Response(200, json=2))
    assert queue.watchdog() == 2
    assert seen[0].url.path == "/rest/v1/rpc/agent_watchdog"
    assert json.loads(seen[0].content) == {}


def test_adr_0069_ultimo_errore_dei_job_morti() -> None:
    from datetime import UTC, datetime

    queue, seen = make_queue(
        lambda r: httpx.Response(200, json=[{"last_error": "Account sospeso [sospeso chiave x]"}])
    )
    since = datetime(2026, 11, 17, tzinfo=UTC)
    assert (
        queue.last_dead_error("api-football.details", since) == "Account sospeso [sospeso chiave x]"
    )
    params = dict(seen[0].url.params)
    assert params["type"] == "eq.api-football.details"
    assert params["status"] == "eq.dead"
    assert params["finished_at"].startswith("gte.2026-11-17")
    empty, _ = make_queue(lambda r: httpx.Response(200, json=[]))
    assert empty.last_dead_error("api-football.details", since) is None
