/**
 * Test del contratto "seguiti": squadre e campionati seguiti da un utente.
 * Dato personale: solo il proprietario, nemmeno gli amministratori.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { FOLLOW_LIMIT, FOLLOW_LIMIT_REACHED } from "@predictra/shared-types";
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

const FD = "football-data-org";

let db: PGlite;
let alice: TestUser;
let bob: TestUser;
let superAdmin: TestUser;
let teamId: number;
let otherTeamId: number;
let competitionId: number;

const id = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ id: number }>(sql, params)).rows[0]!.id);

beforeEach(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  bob = await createAuthUser(db, "bob@example.test");
  superAdmin = await createAuthUser(db, "super@example.test");
  await grantRole(db, alice.id, "USER");
  await grantRole(db, bob.id, "USER");
  await grantRole(db, superAdmin.id, "SUPER_ADMIN");
  competitionId = await id(
    `insert into public.competitions (name, code, type, provider, observed_at)
     values ('DEMO Lega', 'DEMO', 'LEAGUE', $1, now()) returning id`,
    [FD],
  );
  teamId = await id(
    `insert into public.teams (name, tla, provider, observed_at)
     values ('DEMO Squadra Uno', 'DUN', $1, now()) returning id`,
    [FD],
  );
  otherTeamId = await id(
    `insert into public.teams (name, tla, provider, observed_at)
     values ('DEMO Squadra Due', 'DDU', $1, now()) returning id`,
    [FD],
  );
});

describe("contratto seguiti", () => {
  it("si segue una squadra o un campionato, una cosa per riga, senza doppioni", async () => {
    await asUser(db, alice, async (tx) => {
      await tx.query("insert into public.user_follows (team_id) values ($1)", [teamId]);
      await tx.query("insert into public.user_follows (competition_id) values ($1)", [
        competitionId,
      ]);
      expect(
        await attempt(tx, "insert into public.user_follows (team_id) values ($1)", [teamId]),
      ).toMatch(/duplicate key/);
      expect(
        await attempt(
          tx,
          "insert into public.user_follows (team_id, competition_id) values ($1, $2)",
          [otherTeamId, competitionId],
        ),
      ).toMatch(/user_follows_one_target/);
      expect(await attempt(tx, "insert into public.user_follows default values")).toMatch(
        /user_follows_one_target/,
      );
      const { rows } = await tx.query("select team_id, competition_id from public.user_follows");
      expect(rows).toHaveLength(2);
    });
  });

  it("ognuno vede e cancella solo i propri, anche gli amministratori", async () => {
    await asUser(db, alice, (tx) =>
      tx.query("insert into public.user_follows (team_id) values ($1)", [teamId]),
    );
    for (const other of [bob, superAdmin]) {
      await asUser(db, other, async (tx) => {
        expect((await tx.query("select * from public.user_follows")).rows).toEqual([]);
        await tx.query("delete from public.user_follows");
      });
    }
    await asUser(db, alice, async (tx) => {
      expect((await tx.query("select * from public.user_follows")).rows).toHaveLength(1);
      await tx.query("delete from public.user_follows where team_id = $1", [teamId]);
      expect((await tx.query("select * from public.user_follows")).rows).toEqual([]);
    });
  });

  it("non si segue a nome di un altro e non si modifica una riga", async () => {
    await asUser(db, alice, async (tx) => {
      expect(
        await attempt(tx, "insert into public.user_follows (user_id, team_id) values ($1, $2)", [
          bob.id,
          teamId,
        ]),
      ).toMatch(/row-level security/);
      await tx.query("insert into public.user_follows (team_id) values ($1)", [teamId]);
      expect(
        await attempt(tx, "update public.user_follows set team_id = $1", [otherTeamId]),
      ).toMatch(/permission denied/);
    });
  });

  it("il limite per utente è nel database e coincide con quello condiviso", async () => {
    await asServiceRole(db, async (tx) => {
      for (let i = 0; i < FOLLOW_LIMIT; i++) {
        const { rows } = await tx.query<{ id: number }>(
          `insert into public.teams (name, provider, observed_at)
           values ($1, $2, now()) returning id`,
          [`DEMO Limite ${i}`, FD],
        );
        await tx.query("insert into public.user_follows (user_id, team_id) values ($1, $2)", [
          alice.id,
          rows[0]!.id,
        ]);
      }
    });
    await asUser(db, alice, async (tx) => {
      expect(
        await attempt(tx, "insert into public.user_follows (team_id) values ($1)", [teamId]),
      ).toContain(FOLLOW_LIMIT_REACHED);
    });
    // Il limite è per utente.
    await asUser(db, bob, (tx) =>
      tx.query("insert into public.user_follows (team_id) values ($1)", [teamId]),
    );
  });

  it("nessun accesso anonimo, utenti sospesi bloccati, righe eliminate con l'utente", async () => {
    await asUser(db, alice, (tx) =>
      tx.query("insert into public.user_follows (team_id) values ($1)", [teamId]),
    );
    await asAnon(db, async (tx) => {
      expect(await attempt(tx, "select * from public.user_follows")).toMatch(/permission denied/);
    });
    await db.query(
      "update public.profiles set status = 'SUSPENDED', suspended_at = now() where id = $1",
      [alice.id],
    );
    await asUser(db, alice, async (tx) => {
      expect((await tx.query("select * from public.user_follows")).rows).toEqual([]);
      expect(
        await attempt(tx, "insert into public.user_follows (competition_id) values ($1)", [
          competitionId,
        ]),
      ).toMatch(/row-level security/);
    });
    await db.query("delete from auth.users where id = $1", [alice.id]);
    const { rows } = await db.query("select * from public.user_follows");
    expect(rows).toEqual([]);
  });
});
