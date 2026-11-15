/**
 * Watchdog dell'agente (M7 fase A4): notifica dei monitor quando una sorgente è degradata.
 * Cicli e utenti fittizi etichettati DEMO.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
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

let db: PGlite;
let alice: TestUser;
let admin: TestUser;
let superAdmin: TestUser;

const watchdog = () =>
  asServiceRole(db, async (tx) =>
    Number((await tx.query<{ v: number }>("select public.agent_watchdog() v")).rows[0]!.v),
  );
const notified = async () =>
  (
    await db.query<{ user_id: string; dedupe_key: string; link: string; kind: string }>(
      "select user_id, dedupe_key, link, kind from public.notifications where kind = 'agent.degraded' order by user_id",
    )
  ).rows;

beforeEach(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  admin = await createAuthUser(db, "admin@example.test");
  superAdmin = await createAuthUser(db, "super@example.test");
  await grantRole(db, alice.id, "USER");
  await grantRole(db, admin.id, "ADMIN");
  await grantRole(db, superAdmin.id, "SUPER_ADMIN");
});

describe("agent_watchdog", () => {
  it("non notifica nulla se le sorgenti non hanno mai girato", async () => {
    expect(await watchdog()).toBe(0);
    expect(await notified()).toEqual([]);
  });

  it("non notifica se l'ultimo ciclo riuscito è entro la soglia", async () => {
    await db.exec(`
      insert into public.agent_runs (source, schedule, worker_id, status, started_at, finished_at)
      values ('qstash', 'jobs-light', 'demo', 'succeeded', now() - interval '10 minutes', now() - interval '9 minutes');
    `);
    expect(await watchdog()).toBe(0);
  });

  it("notifica Admin e Super Admin una sola volta per episodio", async () => {
    await db.exec(`
      insert into public.agent_runs (source, schedule, worker_id, status, started_at, finished_at)
      values ('github_actions', 'agent-python', 'demo', 'succeeded', now() - interval '8 hours', now() - interval '8 hours' + interval '2 minutes');
    `);
    expect(await watchdog()).toBe(2);
    expect(await watchdog()).toBe(0); // stesso episodio: nessuna nuova notifica
    const rows = await notified();
    expect(rows.map((r) => r.user_id).sort()).toEqual([admin.id, superAdmin.id].sort());
    expect(rows[0]?.link).toBe("/admin/agent");
    expect(rows[0]?.dedupe_key).toMatch(/^agent\.degraded:github_actions:\d+$/);

    // Nuovo episodio: un ciclo riuscito, poi di nuovo fermo oltre la soglia.
    await db.exec(`
      insert into public.agent_runs (source, schedule, worker_id, status, started_at, finished_at)
      values ('github_actions', 'agent-python', 'demo', 'succeeded', now() - interval '7 hours', now() - interval '7 hours' + interval '2 minutes');
    `);
    expect(await watchdog()).toBe(2);
  });

  it("solo cicli falliti: degradato con 'mai'", async () => {
    await db.exec(`
      insert into public.agent_runs (source, schedule, worker_id, status, started_at, finished_at, error_summary)
      values ('qstash', 'jobs-light', 'demo', 'failed', now() - interval '5 minutes', now() - interval '4 minutes', 'DEMO');
    `);
    expect(await watchdog()).toBe(2);
    const rows = await notified();
    expect(rows[0]?.dedupe_key).toBe("agent.degraded:qstash:never");
  });

  it("gli utenti senza agents.monitor non ricevono la notifica", async () => {
    await db.exec(`
      insert into public.agent_runs (source, schedule, worker_id, status, started_at, finished_at)
      values ('qstash', 'jobs-light', 'demo', 'succeeded', now() - interval '3 hours', now() - interval '3 hours');
    `);
    await watchdog();
    await asUser(db, alice, async (tx) => {
      expect(
        Number(
          (await tx.query<{ v: number }>("select count(*) v from public.notifications")).rows[0]!.v,
        ),
      ).toBe(0);
    });
  });

  it("è eseguibile solo da service_role", async () => {
    expect(
      await asUser(db, superAdmin, (tx) => attempt(tx, "select public.agent_watchdog()")),
    ).toMatch(/permission denied/);
    expect(await asAnon(db, (tx) => attempt(tx, "select public.agent_watchdog()"))).toMatch(
      /permission denied/,
    );
  });
});
