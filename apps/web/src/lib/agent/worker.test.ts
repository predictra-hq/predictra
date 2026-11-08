/**
 * Worker TypeScript: idempotenza, ripresa dopo un'interruzione, retry, dead-letter.
 * La coda in memoria segue le regole delle RPC di 20261108150000_agent.sql; le
 * regole SQL stesse sono verificate da supabase/tests/agent.test.ts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { WEB_HANDLERS } from "./handlers";
import {
  type AgentQueue,
  type ClaimedJob,
  type CycleConfig,
  type JobHandler,
  LeaseLostError,
  PermanentJobError,
  QueueError,
  runCycle,
} from "./worker";

interface Row extends ClaimedJob {
  status: "queued" | "running" | "done" | "failed" | "dead";
  nextRunAt: number;
  lockedBy: string | null;
  lockedUntil: number | null;
  lastError: string | null;
  result: Record<string, unknown> | null;
}

class FakeQueue implements AgentQueue {
  jobs: Row[] = [];
  runs = new Map<number, { status: string; errorSummary?: string | null; jobsDone?: number }>();
  failClaim = false;

  constructor(private readonly clock: { now: number }) {}

  enqueue(type: string, key: string, payload: Record<string, unknown> = {}, maxAttempts = 5) {
    const existing = this.jobs.find((j) => j.idempotency_key === key);
    if (existing) return { job_id: existing.id, created: false, status: existing.status };
    const row: Row = {
      id: this.jobs.length + 1,
      type,
      idempotency_key: key,
      payload,
      attempts: 0,
      max_attempts: maxAttempts,
      status: "queued",
      nextRunAt: this.clock.now,
      lockedBy: null,
      lockedUntil: null,
      lastError: null,
      result: null,
    };
    this.jobs.push(row);
    return { job_id: row.id, created: true, status: row.status };
  }

  async startRun() {
    const id = this.runs.size + 1;
    this.runs.set(id, { status: "running" });
    return id;
  }

  async finishRun(
    runId: number,
    status: string,
    counts: { jobsDone: number; errorSummary: string | null },
  ) {
    this.runs.set(runId, { status, jobsDone: counts.jobsDone, errorSummary: counts.errorSummary });
  }

  async claim(workerId: string, opts: { limit: number; leaseSeconds: number; types: string[] }) {
    if (this.failClaim) throw new QueueError("Supabase claim_agent_jobs: servizio non disponibile");
    for (const row of this.jobs) {
      if (
        row.status === "running" &&
        row.lockedUntil !== null &&
        row.lockedUntil < this.clock.now
      ) {
        row.status = row.attempts >= row.max_attempts ? "dead" : "failed";
        row.lockedBy = row.lockedUntil = null;
        row.nextRunAt = this.clock.now;
      }
    }
    const ready = this.jobs
      .filter(
        (r) =>
          (r.status === "queued" || r.status === "failed") &&
          r.nextRunAt <= this.clock.now &&
          opts.types.includes(r.type),
      )
      .slice(0, opts.limit);
    for (const row of ready) {
      row.status = "running";
      row.attempts += 1;
      row.lockedBy = workerId;
      row.lockedUntil = this.clock.now + opts.leaseSeconds * 1000;
    }
    return ready.map((r) => ({ ...r, payload: { ...r.payload } }));
  }

  private owned(jobId: number, workerId: string): Row {
    const row = this.jobs.find((j) => j.id === jobId)!;
    if (row.status !== "running" || row.lockedBy !== workerId)
      throw new LeaseLostError("lease perso");
    return row;
  }

  async extendLease(jobId: number, workerId: string, leaseSeconds: number) {
    this.owned(jobId, workerId).lockedUntil = this.clock.now + leaseSeconds * 1000;
  }

  async complete(jobId: number, workerId: string, result: Record<string, unknown> | null) {
    const row = this.owned(jobId, workerId);
    Object.assign(row, { status: "done", result, lockedBy: null, lockedUntil: null });
  }

  async fail(jobId: number, workerId: string, error: string, retryable: boolean) {
    const row = this.owned(jobId, workerId);
    Object.assign(row, { lastError: error, lockedBy: null, lockedUntil: null });
    if (!retryable || row.attempts >= row.max_attempts) row.status = "dead";
    else {
      row.status = "failed";
      row.nextRunAt = this.clock.now + 60_000 * 2 ** (row.attempts - 1);
    }
    return row.status;
  }

  async consumeQuota() {
    return true;
  }
}

let clock: { now: number };
let queue: FakeQueue;
const now = () => clock.now;
const config = (workerId = "worker-a", over: Partial<CycleConfig> = {}): CycleConfig => ({
  source: "qstash",
  schedule: "demo",
  workerId,
  ...over,
});

beforeEach(() => {
  clock = { now: 1_000_000 };
  queue = new FakeQueue(clock);
});

describe("ciclo del worker", () => {
  it("un ciclo vuoto registra comunque il heartbeat", async () => {
    const summary = await runCycle(queue, WEB_HANDLERS, config(), { now });
    expect(summary).toMatchObject({ status: "succeeded", claimed: 0 });
    expect(queue.runs.get(summary.runId)?.status).toBe("succeeded");
  });

  it("selftest completato", async () => {
    queue.enqueue("agent.selftest.web", "demo:1");
    const summary = await runCycle(queue, WEB_HANDLERS, config(), { now });
    expect(summary).toMatchObject({ status: "succeeded", claimed: 1, done: 1 });
    expect(queue.jobs[0]).toMatchObject({ status: "done", result: { ok: true, attempt: 1 } });
  });

  it("accodare due volte non duplica né riesegue", async () => {
    let calls = 0;
    const handlers: Record<string, JobHandler> = {
      "demo.sink": async () => {
        calls += 1;
        return null;
      },
    };
    queue.enqueue("demo.sink", "demo.sink:2026-11-08T10");
    await runCycle(queue, handlers, config(), { now });
    expect(queue.enqueue("demo.sink", "demo.sink:2026-11-08T10")).toMatchObject({
      created: false,
      status: "done",
    });
    await runCycle(queue, handlers, config(), { now });
    expect(calls).toBe(1);
    expect(queue.jobs).toHaveLength(1);
  });

  it("un job interrotto viene ripreso dopo la scadenza del lease, senza duplicati", async () => {
    const written = new Map<string, number>();
    const handlers: Record<string, JobHandler> = {
      "demo.sink": async ({ job }) => {
        written.set(job.idempotency_key, job.attempts);
        return { rows: 1 };
      },
    };
    queue.enqueue("demo.sink", "demo.sink:k");
    // Il worker A preleva, scrive e "muore" prima di completare.
    const [job] = await queue.claim("worker-a", {
      limit: 1,
      leaseSeconds: 120,
      types: ["demo.sink"],
    });
    written.set(job!.idempotency_key, job!.attempts);

    expect((await runCycle(queue, handlers, config("worker-b"), { now })).claimed).toBe(0);

    clock.now += 121_000;
    const summary = await runCycle(queue, handlers, config("worker-c"), { now });
    expect(summary).toMatchObject({ claimed: 1, done: 1 });
    expect(queue.jobs[0]).toMatchObject({ status: "done", attempts: 2 });
    expect([...written]).toEqual([["demo.sink:k", 2]]);
    await expect(queue.complete(1, "worker-a", null)).rejects.toBeInstanceOf(LeaseLostError);
  });

  it("lease perso durante l'esecuzione: il tentativo non conta", async () => {
    queue.enqueue("demo.lento", "demo:lento");
    const handlers: Record<string, JobHandler> = {
      "demo.lento": async () => {
        clock.now += 200_000;
        await queue.claim("worker-b", { limit: 1, leaseSeconds: 120, types: ["demo.lento"] });
        return null;
      },
    };
    const summary = await runCycle(queue, handlers, config(), { now });
    expect(summary).toMatchObject({ leaseLost: 1, status: "partial" });
    expect(queue.jobs[0]?.lockedBy).toBe("worker-b");
  });

  it("retry con backoff, poi dead-letter", async () => {
    queue.enqueue("agent.selftest.web", "demo:retry", { fail_attempts: 10 }, 3);
    const first = await runCycle(queue, WEB_HANDLERS, config(), { now });
    expect(first).toMatchObject({ status: "partial", failed: 1, dead: 0 });
    expect((await runCycle(queue, WEB_HANDLERS, config(), { now })).claimed).toBe(0);
    for (let i = 0; i < 2; i++) {
      clock.now += 3_600_000;
      await runCycle(queue, WEB_HANDLERS, config(), { now });
    }
    expect(queue.jobs[0]).toMatchObject({ status: "dead", attempts: 3 });
  });

  it("errore non recuperabile: subito dead", async () => {
    queue.enqueue("agent.selftest.web", "demo:fatale", { permanent: true });
    const summary = await runCycle(queue, WEB_HANDLERS, config(), { now });
    expect(summary).toMatchObject({ failed: 1, dead: 1 });
    expect(queue.jobs[0]).toMatchObject({ status: "dead", attempts: 1 });
  });

  it("payload non valido: subito dead", async () => {
    queue.enqueue("agent.selftest.web", "demo:payload", { fail_attempts: "tre" });
    await runCycle(queue, WEB_HANDLERS, config(), { now });
    expect(queue.jobs[0]?.status).toBe("dead");
  });

  it("preleva solo i tipi che sa eseguire", async () => {
    queue.enqueue("agent.selftest.python", "demo:python");
    expect((await runCycle(queue, WEB_HANDLERS, config(), { now })).claimed).toBe(0);
    expect(queue.jobs[0]?.status).toBe("queued");
  });

  it("rispetta maxJobs e il tempo a disposizione", async () => {
    for (let i = 0; i < 5; i++) queue.enqueue("agent.selftest.web", `demo:${i}`);
    expect((await runCycle(queue, WEB_HANDLERS, config("w", { maxJobs: 2 }), { now })).done).toBe(
      2,
    );
    const slow: Record<string, JobHandler> = {
      "agent.selftest.web": async () => {
        clock.now += 100_000;
      },
    };
    // 240 s di budget e lease di 120 s: dopo il primo job (100 s) ne resta spazio per uno solo.
    const summary = await runCycle(queue, slow, config(), { now });
    expect(summary.done).toBe(2);
  });

  it("gli errori non contengono segreti", async () => {
    const secret = "sb_secret_DEMO_NON_REALE";
    queue.enqueue("demo.boom", "demo:boom");
    const handlers: Record<string, JobHandler> = {
      "demo.boom": async () => {
        throw new Error(`rifiutato con chiave ${secret}`);
      },
    };
    const summary = await runCycle(queue, handlers, config(), { now, secrets: [secret] });
    expect(queue.jobs[0]?.lastError).not.toContain(secret);
    expect(queue.jobs[0]?.lastError).toContain("***");
    expect(summary.errors.join(" ")).not.toContain(secret);
  });

  it("un errore della coda chiude il ciclo come fallito", async () => {
    queue.failClaim = true;
    const summary = await runCycle(queue, WEB_HANDLERS, config(), { now });
    expect(summary.status).toBe("failed");
    expect(queue.runs.get(summary.runId)?.errorSummary).toMatch(/non disponibile/);
  });

  it("PermanentJobError è riconoscibile", () => {
    expect(new PermanentJobError("x")).toBeInstanceOf(Error);
    expect(new LeaseLostError("x").code).toBe("55000");
  });
});
