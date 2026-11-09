/**
 * Test del contratto Ask PREDICTRA (ADR 0042): quota giornaliera nel database,
 * contatori visibili solo al proprietario, nessun testo salvato.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { ASK_DAILY_LIMIT, ASK_QUOTA_EXCEEDED } from "@predictra/shared-types";
import {
  asAnon,
  asUser,
  attempt,
  createAuthUser,
  createDatabase,
  grantRole,
  type TestUser,
} from "./harness";

let db: PGlite;
let alice: TestUser;
let bob: TestUser;
let superAdmin: TestUser;

beforeEach(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  bob = await createAuthUser(db, "bob@example.test");
  superAdmin = await createAuthUser(db, "super@example.test");
  await grantRole(db, alice.id, "USER");
  await grantRole(db, bob.id, "USER");
  await grantRole(db, superAdmin.id, "SUPER_ADMIN");
});

const consume = (tx: Pick<PGlite, "query">) =>
  tx.query<{ v: number }>("select public.ask_consume() v").then((r) => Number(r.rows[0]!.v));

describe("contratto Ask PREDICTRA", () => {
  it("il limite nel database coincide con quello condiviso", async () => {
    const { rows } = await db.query<{ v: number }>("select app_private.ask_daily_limit() v");
    expect(rows[0]!.v).toBe(ASK_DAILY_LIMIT);
  });

  it("la tabella contiene solo contatori, nessun testo", async () => {
    const { rows } = await db.query<{ column_name: string; data_type: string }>(
      `select column_name, data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'ask_usage'`,
    );
    expect(rows.filter((r) => r.data_type === "text")).toEqual([]);
  });

  it("consuma la quota e si ferma al limite", async () => {
    await asUser(db, alice, async (tx) => {
      expect(await consume(tx)).toBe(ASK_DAILY_LIMIT - 1);
      for (let i = 2; i <= ASK_DAILY_LIMIT; i++) await consume(tx);
      expect(await attempt(tx, "select public.ask_consume()")).toContain(ASK_QUOTA_EXCEEDED);
      const { rows } = await tx.query<{ questions: number }>(
        "select questions from public.ask_usage",
      );
      expect(rows).toEqual([{ questions: ASK_DAILY_LIMIT }]);
    });
    // La quota è per utente.
    await asUser(db, bob, async (tx) => expect(await consume(tx)).toBe(ASK_DAILY_LIMIT - 1));
  });

  it("registra token e risposte scartate solo sulla propria riga", async () => {
    await asUser(db, alice, async (tx) => {
      await consume(tx);
      await tx.query("select public.ask_record(1200, true)");
      await tx.query("select public.ask_record(800, false)");
      expect(await attempt(tx, "select public.ask_record(-1, false)")).toContain(
        "Token non validi",
      );
      const { rows } = await tx.query("select tokens, rejected from public.ask_usage");
      expect(rows).toEqual([{ tokens: 2000, rejected: 1 }]);
    });
  });

  it("ognuno vede solo il proprio uso, anche gli amministratori", async () => {
    await asUser(db, alice, (tx) => consume(tx));
    await asUser(db, bob, async (tx) => {
      expect((await tx.query("select * from public.ask_usage")).rows).toEqual([]);
    });
    await asUser(db, superAdmin, async (tx) => {
      expect((await tx.query("select * from public.ask_usage")).rows).toEqual([]);
    });
  });

  it("nessuna scrittura diretta, nessun accesso anonimo, utenti sospesi bloccati", async () => {
    await asUser(db, alice, async (tx) => {
      expect(
        await attempt(
          tx,
          "insert into public.ask_usage (user_id, day, questions) values ($1, current_date, 0)",
          [alice.id],
        ),
      ).toContain("permission denied");
      await consume(tx);
      expect(await attempt(tx, "update public.ask_usage set questions = 0")).toContain(
        "permission denied",
      );
    });
    await asAnon(db, async (tx) => {
      expect(await attempt(tx, "select public.ask_consume()")).toContain("permission denied");
      expect(await attempt(tx, "select * from public.ask_usage")).toContain("permission denied");
    });
    await db.query(
      "update public.profiles set status = 'SUSPENDED', suspended_at = now() where id = $1",
      [alice.id],
    );
    await asUser(db, alice, async (tx) => {
      expect(await attempt(tx, "select public.ask_consume()")).toContain("Utente non attivo");
    });
  });
});
