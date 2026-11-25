/**
 * Test del contratto M7 (agente autonomo): coda, cicli, contatori, notifiche.
 * Job e utenti fittizi etichettati DEMO: verificano lo schema e non arrivano mai su DEV.
 *
 * PGlite ha una sola connessione: il prelievo "concorrente" è verificato con
 * prelievi in transazioni successive (il lease impedisce il doppio prelievo) e
 * controllando che la funzione usi FOR UPDATE SKIP LOCKED.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  AGENT_JOB_STATUSES,
  AGENT_RUN_SOURCES,
  agentBackoffBoundsSeconds,
} from "@predictra/shared-types";
import {
  asAnon,
  asServiceRole,
  asUser,
  attempt,
  createAuthUser,
  createDatabase,
  grantRole,
  type TestUser,
} from "./harness";

type Tx = Pick<PGlite, "query" | "exec">;

interface JobRow {
  id: number;
  type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  locked_by: string | null;
  locked_until: string | null;
  next_run_at: string;
  last_error: string | null;
}

let db: PGlite;
let alice: TestUser;
let bob: TestUser;
let admin: TestUser;
let superAdmin: TestUser;

const one = async <T>(tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0] as T;
const num = async (tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  Number((await one<{ v: number }>(tx, sql, params)).v);

const enqueue = (tx: Tx, type: string, key: string, maxAttempts = 5) =>
  one<{ job_id: number; created: boolean; status: string }>(
    tx,
    "select * from public.enqueue_agent_job($1, $2, $3, null, $4)",
    [type, key, JSON.stringify({ demo: true }), maxAttempts],
  );
const claim = async (tx: Tx, worker: string, limit = 1, lease = 300) =>
  (
    await tx.query<JobRow>("select * from public.claim_agent_jobs($1, $2, $3)", [
      worker,
      limit,
      lease,
    ])
  ).rows;
const job = (tx: Tx, id: number) =>
  one<JobRow>(tx, "select * from public.agent_jobs where id = $1", [id]);

/** Fa scadere il lease (setup di test, come superuser). */
const expireLease = (id: number) =>
  db.query(
    "update public.agent_jobs set locked_until = now() - interval '1 second', started_at = now() - interval '10 minutes' where id = $1",
    [id],
  );
/** Rende subito prelevabile un job in attesa di retry. */
const makeReady = (id: number) =>
  db.query("update public.agent_jobs set next_run_at = now() - interval '1 second' where id = $1", [
    id,
  ]);

beforeEach(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  bob = await createAuthUser(db, "bob@example.test");
  admin = await createAuthUser(db, "admin@example.test");
  superAdmin = await createAuthUser(db, "super@example.test");
  await grantRole(db, alice.id, "USER");
  await grantRole(db, bob.id, "USER");
  await grantRole(db, admin.id, "ADMIN");
  await grantRole(db, superAdmin.id, "SUPER_ADMIN");
});

describe("tipi condivisi", () => {
  it("specchiano gli enum del database", async () => {
    const labels = async (type: string) =>
      (
        await db.query<{ v: string }>(`select unnest(enum_range(null::public.${type}))::text v`)
      ).rows.map((r) => r.v);
    expect(await labels("agent_job_status")).toEqual([...AGENT_JOB_STATUSES]);
    expect(await labels("agent_run_source")).toEqual([...AGENT_RUN_SOURCES]);
  });
});

describe("accodamento idempotente", () => {
  it("la stessa chiave non crea duplicati, anche dopo il completamento", async () => {
    await asServiceRole(db, async (tx) => {
      const first = await enqueue(tx, "demo.ping", "demo.ping:2026-11-08T10");
      expect(first.created).toBe(true);
      const again = await enqueue(tx, "demo.ping", "demo.ping:2026-11-08T10");
      expect(again).toMatchObject({ job_id: first.job_id, created: false, status: "queued" });

      const [claimed] = await claim(tx, "demo-worker");
      await tx.query("select public.complete_agent_job($1, $2, $3)", [
        claimed!.id,
        "demo-worker",
        JSON.stringify({ rows: 0 }),
      ]);
      const afterDone = await enqueue(tx, "demo.ping", "demo.ping:2026-11-08T10");
      expect(afterDone).toMatchObject({ job_id: first.job_id, created: false, status: "done" });
      expect(await num(tx, "select count(*) v from public.agent_jobs")).toBe(1);
    });
  });

  it("una chiave già usata da un altro tipo è un errore", async () => {
    await asServiceRole(db, async (tx) => {
      await enqueue(tx, "demo.ping", "demo:chiave");
      const error = await attempt(
        tx,
        "select * from public.enqueue_agent_job('demo.altro', 'demo:chiave')",
      );
      expect(error).toMatch(/appartiene a un job di tipo demo.ping/);
    });
  });
});

describe("prelievo", () => {
  it("usa FOR UPDATE SKIP LOCKED", async () => {
    const def = await one<{ v: string }>(
      db,
      "select pg_get_functiondef('public.claim_agent_jobs(text, integer, integer, text[], bigint)'::regprocedure) v",
    );
    expect(def.v.toLowerCase()).toContain("for update skip locked");
  });

  it("due worker non prendono lo stesso job", async () => {
    await asServiceRole(db, async (tx) => {
      await enqueue(tx, "demo.ping", "demo:1");
      await enqueue(tx, "demo.ping", "demo:2");
    });
    const a = await asServiceRole(db, (tx) => claim(tx, "worker-a"));
    const b = await asServiceRole(db, (tx) => claim(tx, "worker-b"));
    const c = await asServiceRole(db, (tx) => claim(tx, "worker-c"));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.id).not.toBe(b[0]!.id);
    expect(c).toHaveLength(0);
    expect(a[0]).toMatchObject({ status: "running", attempts: 1, locked_by: "worker-a" });
  });

  it("i job rimandati non si prelevano prima di next_run_at", async () => {
    await asServiceRole(db, async (tx) => {
      await tx.query(
        "select * from public.enqueue_agent_job('demo.ping', 'demo:futuro', '{}', now() + interval '1 hour')",
      );
      expect(await claim(tx, "worker-a", 10)).toHaveLength(0);
    });
  });

  it("solo chi possiede il lease completa o fa fallire il job", async () => {
    await asServiceRole(db, async (tx) => {
      const { job_id } = await enqueue(tx, "demo.ping", "demo:lease");
      await claim(tx, "worker-a");
      expect(
        await attempt(tx, "select public.complete_agent_job($1, 'worker-b')", [job_id]),
      ).toMatch(/lease perso/);
      expect(
        await attempt(tx, "select public.fail_agent_job($1, 'worker-b', 'x')", [job_id]),
      ).toMatch(/lease perso/);
      const until = await one<{ v: string }>(
        tx,
        "select public.extend_agent_job_lease($1, 'worker-a', 600) v",
        [job_id],
      );
      expect(new Date(until.v).getTime()).toBeGreaterThan(Date.now() + 500_000);
    });
  });
});

describe("lease scaduto", () => {
  it("il job di un worker interrotto viene ripreso da un altro", async () => {
    const [first] = await asServiceRole(db, async (tx) => {
      await enqueue(tx, "demo.ping", "demo:interrotto");
      return claim(tx, "worker-a");
    });
    // Lease valido: nessun altro lo prende.
    expect(await asServiceRole(db, (tx) => claim(tx, "worker-b"))).toHaveLength(0);

    await expireLease(first!.id);
    const [again] = await asServiceRole(db, (tx) => claim(tx, "worker-b"));
    expect(again).toMatchObject({ id: first!.id, locked_by: "worker-b", attempts: 2 });

    // Il vecchio worker ha perso il lease.
    await asServiceRole(db, async (tx) => {
      expect(
        await attempt(tx, "select public.complete_agent_job($1, 'worker-a')", [first!.id]),
      ).toMatch(/lease perso/);
      await tx.query("select public.complete_agent_job($1, 'worker-b')", [first!.id]);
      expect((await job(tx, first!.id)).status).toBe("done");
    });
  });

  it("recover_expired_agent_jobs rimette in coda o passa a dead", async () => {
    const ids = await asServiceRole(db, async (tx) => {
      const a = await enqueue(tx, "demo.ping", "demo:r1", 3);
      const b = await enqueue(tx, "demo.ping", "demo:r2", 1);
      await claim(tx, "worker-a", 2);
      return [a.job_id, b.job_id];
    });
    await expireLease(ids[0]!);
    await expireLease(ids[1]!);
    await asServiceRole(db, async (tx) => {
      expect(await num(tx, "select public.recover_expired_agent_jobs() v")).toBe(2);
      expect(await job(tx, ids[0]!)).toMatchObject({ status: "failed", locked_by: null });
      expect((await job(tx, ids[0]!)).last_error).toMatch(/Lease scaduto/);
      expect((await job(tx, ids[1]!)).status).toBe("dead");
    });
  });
});

describe("retry, backoff e dead-letter", () => {
  it("rimanda con backoff esponenziale e jitter, poi passa a dead", async () => {
    const { job_id } = await asServiceRole(db, (tx) => enqueue(tx, "demo.ping", "demo:retry", 3));

    for (let attemptNo = 1; attemptNo <= 2; attemptNo++) {
      await asServiceRole(db, async (tx) => {
        await claim(tx, "worker-a");
        const before = Date.now();
        const status = await one<{ v: string }>(
          tx,
          "select public.fail_agent_job($1, 'worker-a', 'DEMO errore') v",
          [job_id],
        );
        expect(status.v).toBe("failed");
        const row = await job(tx, job_id);
        const delay = (new Date(row.next_run_at).getTime() - before) / 1000;
        const [min, max] = agentBackoffBoundsSeconds(attemptNo);
        expect(delay).toBeGreaterThanOrEqual(min - 2);
        expect(delay).toBeLessThanOrEqual(max + 2);
        expect(await claim(tx, "worker-b")).toHaveLength(0);
      });
      await makeReady(job_id);
    }

    await asServiceRole(db, async (tx) => {
      const [third] = await claim(tx, "worker-a");
      expect(third!.attempts).toBe(3);
      const status = await one<{ v: string }>(
        tx,
        "select public.fail_agent_job($1, 'worker-a', 'DEMO errore finale') v",
        [job_id],
      );
      expect(status.v).toBe("dead");
      expect(await claim(tx, "worker-b")).toHaveLength(0);
    });

    // I monitor (Admin e Super Admin) ricevono una notifica, gli utenti no.
    const kinds = await db.query<{ user_id: string }>(
      "select user_id from public.notifications where kind = 'agent.job_dead'",
    );
    expect(kinds.rows.map((r) => r.user_id).sort()).toEqual([admin.id, superAdmin.id].sort());
  });

  it("un errore non recuperabile passa subito a dead", async () => {
    await asServiceRole(db, async (tx) => {
      const { job_id } = await enqueue(tx, "demo.ping", "demo:fatale");
      await claim(tx, "worker-a");
      const status = await one<{ v: string }>(
        tx,
        "select public.fail_agent_job($1, 'worker-a', 'DEMO payload non valido', false) v",
        [job_id],
      );
      expect(status.v).toBe("dead");
    });
  });

  it("la ripresa manuale richiede agents.monitor con 2FA ed è registrata nell'audit", async () => {
    const { job_id } = await asServiceRole(db, async (tx) => {
      const queued = await enqueue(tx, "demo.ping", "demo:manuale", 1);
      await claim(tx, "worker-a");
      await tx.query("select public.fail_agent_job($1, 'worker-a', 'DEMO')", [queued.job_id]);
      return queued;
    });

    const retry = "select public.retry_dead_agent_job($1)";
    expect(await asUser(db, alice, (tx) => attempt(tx, retry, [job_id]))).toMatch(
      /Permessi insufficienti/,
    );
    expect(await asUser(db, admin, (tx) => attempt(tx, retry, [job_id]), "aal1")).toMatch(
      /due fattori/,
    );
    expect(await asAnon(db, (tx) => attempt(tx, retry, [job_id]))).toMatch(/permission denied/);
    expect(await asServiceRole(db, (tx) => attempt(tx, retry, [job_id]))).toMatch(
      /permission denied/,
    );

    await asUser(db, admin, (tx) => tx.query(retry, [job_id]));
    await asServiceRole(db, async (tx) => {
      expect(await job(tx, job_id)).toMatchObject({ status: "queued", attempts: 0 });
    });
    const audit = await db.query<{ actor_id: string; target_id: string }>(
      "select actor_id, target_id from public.audit_logs where action = 'agent.job_retried'",
    );
    expect(audit.rows).toEqual([{ actor_id: admin.id, target_id: String(job_id) }]);

    // Un job non dead non si riprende.
    expect(await asUser(db, superAdmin, (tx) => attempt(tx, retry, [job_id]))).toMatch(
      /non è in dead-letter/,
    );
  });
});

describe("cicli e contatori", () => {
  it("registra i cicli e chiude quelli rimasti aperti", async () => {
    await asServiceRole(db, (tx) =>
      tx.query("select public.start_agent_run('github_actions', 'agent-python', 'demo-runner')"),
    );
    await db.query("update public.agent_runs set started_at = now() - interval '2 hours'");
    await asServiceRole(db, async (tx) => {
      const run = await num(
        tx,
        "select public.start_agent_run('qstash', 'jobs-light', 'demo-vercel') v",
      );
      await tx.query("select public.finish_agent_run($1, 'succeeded', 2, 2, 0)", [run]);
      expect(await attempt(tx, "select public.finish_agent_run($1, 'succeeded')", [run])).toMatch(
        /già chiuso/,
      );
      const statuses = await tx.query<{ source: string; status: string }>(
        "select source, status from public.agent_runs order by id",
      );
      expect(statuses.rows).toEqual([
        { source: "github_actions", status: "failed" },
        { source: "qstash", status: "succeeded" },
      ]);
    });
  });

  it("v_agent_status dichiara la frequenza reale e lo stato degradato", async () => {
    // Tre cicli QStash riusciti a 15 minuti di distanza, l'ultimo 5 minuti fa.
    await db.exec(`
      insert into public.agent_runs (source, schedule, worker_id, status, started_at, finished_at) values
        ('qstash', 'jobs-light', 'demo', 'succeeded', now() - interval '35 minutes', now() - interval '34 minutes'),
        ('qstash', 'jobs-light', 'demo', 'succeeded', now() - interval '20 minutes', now() - interval '19 minutes'),
        ('qstash', 'jobs-light', 'demo', 'succeeded', now() - interval '5 minutes',  now() - interval '4 minutes'),
        ('github_actions', 'agent-python', 'demo', 'failed', now() - interval '1 hour', now() - interval '50 minutes');
    `);
    const rows = await asUser(
      db,
      admin,
      async (tx) =>
        (
          await tx.query<{
            source: string;
            observed_interval_minutes: string | null;
            is_degraded: boolean;
            runs_24h: number;
            failed_runs_24h: number;
          }>("select * from public.v_agent_status order by source")
        ).rows,
    );
    const qstash = rows.find((r) => r.source === "qstash")!;
    const actions = rows.find((r) => r.source === "github_actions")!;
    expect(Number(qstash.observed_interval_minutes)).toBeCloseTo(15, 0);
    expect(qstash.is_degraded).toBe(false);
    expect(qstash.runs_24h).toBe(3);
    // Nessun ciclo GitHub Actions riuscito: degradato.
    expect(actions.is_degraded).toBe(true);
    expect(actions.failed_runs_24h).toBe(1);
  });

  it("consume_agent_quota non supera il budget della finestra", async () => {
    await asServiceRole(db, async (tx) => {
      const consume = (cost: number) =>
        one<{ v: boolean }>(tx, "select public.consume_agent_quota('qstash', 'day', 10, $1) v", [
          cost,
        ]);
      expect((await consume(6)).v).toBe(true);
      expect((await consume(4)).v).toBe(true);
      expect((await consume(1)).v).toBe(false);
      const row = await one<{ used: number; quota: number }>(
        tx,
        "select used, quota from public.agent_rate_limits where provider = 'qstash'",
      );
      expect(row).toEqual({ used: 10, quota: 10 });
    });
  });

  it("v_agent_queue_summary riassume le code per tipo e stato", async () => {
    await asServiceRole(db, async (tx) => {
      await enqueue(tx, "demo.ping", "demo:s1");
      await enqueue(tx, "demo.ping", "demo:s2");
      await enqueue(tx, "demo.altro", "demo:s3");
      await claim(tx, "worker-a", 1);
    });
    const rows = await asUser(
      db,
      superAdmin,
      async (tx) =>
        (
          await tx.query<{ type: string; status: string; jobs: number; ready: number }>(
            "select type, status, jobs, ready from public.v_agent_queue_summary order by type, status",
          )
        ).rows,
    );
    expect(rows).toEqual([
      { type: "demo.altro", status: "queued", jobs: 1, ready: 1 },
      { type: "demo.ping", status: "queued", jobs: 1, ready: 1 },
      { type: "demo.ping", status: "running", jobs: 1, ready: 0 },
    ]);
  });
});

describe("RLS", () => {
  beforeEach(async () => {
    await asServiceRole(db, async (tx) => {
      await enqueue(tx, "demo.ping", "demo:rls");
      const run = await num(tx, "select public.start_agent_run('manual', 'demo', 'demo') v");
      await tx.query("select public.finish_agent_run($1, 'succeeded')", [run]);
      await tx.query("select public.consume_agent_quota('demo-provider', 'day', 5)");
      await tx.query("select public.notify_user($1, 'demo.info', 'DEMO per Alice')", [alice.id]);
      await tx.query("select public.notify_user($1, 'demo.info', 'DEMO per Bob')", [bob.id]);
    });
  });

  const agentTables = [
    "agent_jobs",
    "agent_runs",
    "agent_rate_limits",
    "v_agent_status",
    "v_agent_queue_summary",
  ];

  it("chi non ha agents.monitor non vede code, cicli e contatori", async () => {
    await asUser(db, alice, async (tx) => {
      for (const table of agentTables) {
        const count = await num(tx, `select count(*) v from public.${table}`);
        // v_agent_status ha una riga per sorgente attesa, ma senza dati.
        if (table === "v_agent_status") {
          const runs = await num(
            tx,
            "select coalesce(sum(runs_24h), 0) v from public.v_agent_status",
          );
          expect(runs).toBe(0);
        } else {
          expect(count, table).toBe(0);
        }
      }
    });
  });

  it("Admin e Super Admin vedono code, cicli e contatori", async () => {
    for (const user of [admin, superAdmin]) {
      await asUser(db, user, async (tx) => {
        expect(await num(tx, "select count(*) v from public.agent_jobs")).toBe(1);
        expect(await num(tx, "select count(*) v from public.agent_runs")).toBe(1);
        expect(await num(tx, "select count(*) v from public.agent_rate_limits")).toBe(1);
      });
    }
  });

  it("un admin sospeso non vede nulla", async () => {
    await db.query(
      "update public.profiles set status = 'SUSPENDED', suspended_at = now() where id = $1",
      [admin.id],
    );
    await asUser(db, admin, async (tx) => {
      expect(await num(tx, "select count(*) v from public.agent_jobs")).toBe(0);
    });
  });

  it("anon non legge nulla", async () => {
    await asAnon(db, async (tx) => {
      for (const table of [...agentTables, "notifications"]) {
        expect(await attempt(tx, `select * from public.${table}`), table).toMatch(
          /permission denied/,
        );
      }
    });
  });

  it("le notifiche sono isolate tra utenti, anche dagli admin", async () => {
    await asUser(db, alice, async (tx) => {
      const rows = await tx.query<{ title: string }>("select title from public.notifications");
      expect(rows.rows).toEqual([{ title: "DEMO per Alice" }]);
      // Alice non può segnare come letta la notifica di Bob.
      await tx.query("update public.notifications set read_at = now()");
    });
    await asUser(db, bob, async (tx) => {
      const rows = await tx.query<{ title: string; read_at: string | null }>(
        "select title, read_at from public.notifications",
      );
      expect(rows.rows).toEqual([{ title: "DEMO per Bob", read_at: null }]);
    });
    await asUser(db, superAdmin, async (tx) => {
      expect(await num(tx, "select count(*) v from public.notifications")).toBe(0);
    });
    const aliceRead = await one<{ read_at: string | null }>(
      db,
      "select read_at from public.notifications where user_id = $1",
      [alice.id],
    );
    expect(aliceRead.read_at).not.toBeNull();
  });

  it("di una notifica il proprietario cambia solo read_at e può eliminarla (ADR 0071)", async () => {
    await asUser(db, alice, async (tx) => {
      expect(await attempt(tx, "update public.notifications set title = 'x'")).toMatch(
        /permission denied/,
      );
      expect(
        await attempt(
          tx,
          "insert into public.notifications (user_id, kind, title) values (auth.uid(), 'demo', 'x')",
        ),
      ).toMatch(/permission denied/);
      // Elimina tutto quello che vede: solo le sue.
      await tx.query("delete from public.notifications");
    });
    const left = await db.query<{ user_id: string }>("select user_id from public.notifications");
    expect(left.rows).toEqual([{ user_id: bob.id }]);
  });

  it("le scritture dirette sono negate a tutti, anche a service_role", async () => {
    const writes = [
      "insert into public.agent_jobs (type, idempotency_key) values ('demo.x', 'demo:x')",
      "update public.agent_jobs set status = 'done'",
      "delete from public.agent_jobs",
      "insert into public.agent_runs (source, schedule, worker_id) values ('manual', 'demo', 'demo')",
      "update public.agent_runs set status = 'failed'",
      "insert into public.agent_rate_limits (provider, window_kind, window_start, quota) values ('x', 'day', now(), 1)",
      "update public.agent_rate_limits set used = 0",
      "insert into public.notifications (user_id, kind, title) values ('" +
        "00000000-0000-0000-0000-000000000000', 'demo', 'x')",
    ];
    for (const run of [
      (fn: (tx: Tx) => Promise<void>) => asUser(db, superAdmin, fn),
      (fn: (tx: Tx) => Promise<void>) => asUser(db, alice, fn),
      (fn: (tx: Tx) => Promise<void>) => asServiceRole(db, fn),
    ]) {
      await run(async (tx) => {
        for (const sql of writes) {
          expect(await attempt(tx, sql), sql).toMatch(/permission denied/);
        }
      });
    }
  });

  it("le funzioni dei worker non sono eseguibili da utenti autenticati o anon", async () => {
    const calls = [
      "select * from public.enqueue_agent_job('demo.x', 'demo:y')",
      "select * from public.claim_agent_jobs('w')",
      "select public.recover_expired_agent_jobs()",
      "select public.start_agent_run('manual', 'demo', 'demo')",
      "select public.consume_agent_quota('x', 'day', 1)",
      "select public.notify_user(auth.uid(), 'demo', 'x')",
    ];
    for (const sql of calls) {
      expect(await asUser(db, superAdmin, (tx) => attempt(tx, sql)), sql).toMatch(
        /permission denied/,
      );
      expect(await asAnon(db, (tx) => attempt(tx, sql)), sql).toMatch(/permission denied/);
    }
  });
});
