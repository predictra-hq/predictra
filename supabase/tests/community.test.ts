/**
 * Test del contratto "comunità": data di nascita (solo proprietario), stile del nome,
 * commenti alle partite (solo maggiorenni dichiarati), moderazione degli amministratori.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { BIRTH_DATE_INVALID, COMMENT_RATE_LIMIT } from "@predictra/shared-types";
import {
  asAnon,
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
let young: TestUser;
let admin: TestUser;
let matchId: number;

const id = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ id: number }>(sql, params)).rows[0]!.id);

const setBirthday = (user: TestUser, date: string, show = false) =>
  asUser(db, user, (tx) =>
    tx.query("insert into public.user_birthdays (birth_date, show_birthday) values ($1, $2)", [
      date,
      show,
    ]),
  );

beforeEach(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  bob = await createAuthUser(db, "bob@example.test");
  young = await createAuthUser(db, "young@example.test");
  admin = await createAuthUser(db, "admin@example.test");
  for (const u of [alice, bob, young]) await grantRole(db, u.id, "USER");
  await grantRole(db, admin.id, "SUPER_ADMIN");
  await db.query("update public.profiles set display_name = 'Alice' where id = $1", [alice.id]);

  const competitionId = await id(
    `insert into public.competitions (name, code, type, provider, observed_at)
     values ('DEMO Lega', 'DEMO', 'LEAGUE', $1, now()) returning id`,
    [FD],
  );
  const seasonId = await id(
    `insert into public.seasons (competition_id, label, start_date, end_date, provider, observed_at)
     values ($1, '2025/26', '2025-08-01', '2026-06-30', $2, now()) returning id`,
    [competitionId, FD],
  );
  const team = (name: string, tla: string) =>
    id(
      `insert into public.teams (name, tla, provider, observed_at)
       values ($1, $2, $3, now()) returning id`,
      [name, tla, FD],
    );
  const home = await team("DEMO Squadra Uno", "DUN");
  const away = await team("DEMO Squadra Due", "DDU");
  matchId = await id(
    `insert into public.matches (competition_id, season_id, kickoff_at, status, home_team_id,
       away_team_id, provider, observed_at, event_time)
     values ($1, $2, now(), 'SCHEDULED', $3, $4, $5, now(), now()) returning id`,
    [competitionId, seasonId, home, away, FD],
  );

  await setBirthday(alice, "1990-05-10");
  await setBirthday(bob, "1985-01-02");
  await setBirthday(young, new Date(Date.now() - 16 * 365 * 864e5).toISOString().slice(0, 10));
});

describe("data di nascita", () => {
  it("la vede solo il proprietario, non gli altri utenti né gli amministratori", async () => {
    const seen = (user: TestUser) =>
      asUser(db, user, async (tx) =>
        (await tx.query<{ user_id: string }>("select user_id from public.user_birthdays")).rows.map(
          (r) => r.user_id,
        ),
      );
    expect(await seen(alice)).toEqual([alice.id]);
    expect(await seen(admin)).toEqual([]);
    const anon = await asAnon(db, (tx) => attempt(tx, "select * from public.user_birthdays"));
    expect(anon).toMatch(/permission denied/);
  });

  it("rifiuta date nel futuro o prima del 1900", async () => {
    await asUser(db, admin, async (tx) => {
      expect(
        await attempt(tx, "insert into public.user_birthdays (birth_date) values ('2999-01-01')"),
      ).toContain(BIRTH_DATE_INVALID);
      expect(
        await attempt(tx, "insert into public.user_birthdays (birth_date) values ('1850-01-01')"),
      ).toContain(BIRTH_DATE_INVALID);
    });
  });

  it("i compleanni di oggi mostrano solo nome e stile di chi li rende visibili", async () => {
    const today = await db.query<{ d: string }>(
      "select to_char((now() at time zone 'Europe/Rome')::date - interval '30 years', 'YYYY-MM-DD') d",
    );
    await asUser(db, alice, (tx) =>
      tx.query("update public.user_birthdays set birth_date = $1, show_birthday = true", [
        today.rows[0]!.d,
      ]),
    );
    await asUser(db, bob, (tx) =>
      tx.query("update public.user_birthdays set birth_date = $1, show_birthday = false", [
        today.rows[0]!.d,
      ]),
    );
    const rows = await asUser(
      db,
      young,
      async (tx) =>
        (await tx.query<Record<string, unknown>>("select * from public.birthdays_today()")).rows,
    );
    expect(rows).toEqual([{ display_name: "Alice", name_color: null, name_style: null }]);
  });
});

describe("stile del nome", () => {
  it("si sceglie dall'elenco chiuso, solo sul proprio profilo", async () => {
    await asUser(db, alice, async (tx) => {
      await tx.query(
        "update public.profiles set name_color = 'violet', name_style = 'italic' where id = $1",
        [alice.id],
      );
      expect(
        await attempt(tx, "update public.profiles set name_color = '#ff0000' where id = $1", [
          alice.id,
        ]),
      ).toMatch(/profiles_name_color_check/);
      const other = await tx.query(
        "update public.profiles set name_color = 'red' where id = $1 returning id",
        [bob.id],
      );
      expect(other.rows).toEqual([]);
    });
  });
});

describe("commenti alle partite", () => {
  const comment = (tx: Pick<PGlite, "query" | "exec">, body: string) =>
    attempt(tx, "insert into public.match_comments (match_id, body) values ($1, $2)", [
      matchId,
      body,
    ]);

  it("li scrive e li legge solo chi ha dichiarato 18 anni", async () => {
    await asUser(db, alice, async (tx) => expect(await comment(tx, "Partita aperta")).toBeNull());
    await asUser(db, young, async (tx) =>
      expect(await comment(tx, "Ciao")).toMatch(/row-level security/),
    );
    const feed = (user: TestUser) =>
      asUser(
        db,
        user,
        async (tx) =>
          (
            await tx.query<{ body: string; author_name: string; is_own: boolean }>(
              "select body, author_name, is_own from public.match_comment_feed($1)",
              [matchId],
            )
          ).rows,
      );
    expect(await feed(bob)).toEqual([
      { body: "Partita aperta", author_name: "Alice", is_own: false },
    ]);
    expect(await feed(alice)).toEqual([
      { body: "Partita aperta", author_name: "Alice", is_own: true },
    ]);
    expect(await feed(young)).toEqual([]);
  });

  it("dalla tabella ognuno vede e cancella solo i propri, e non li modifica", async () => {
    await asUser(db, alice, (tx) => comment(tx, "Mio"));
    await asUser(db, bob, async (tx) => {
      expect((await tx.query("select id from public.match_comments")).rows).toEqual([]);
      const del = await tx.query("delete from public.match_comments returning id");
      expect(del.rows).toEqual([]);
    });
    await asUser(db, alice, async (tx) => {
      expect(await attempt(tx, "update public.match_comments set body = 'x'")).toMatch(
        /permission denied/,
      );
      const del = await tx.query("delete from public.match_comments returning id");
      expect(del.rows).toHaveLength(1);
    });
  });

  it("rifiuta testi vuoti o troppo lunghi e le raffiche", async () => {
    await asUser(db, alice, async (tx) => {
      expect(await comment(tx, "   ")).toMatch(/match_comments_body_check/);
      expect(await comment(tx, "x".repeat(501))).toMatch(/match_comments_body_check/);
      for (let i = 0; i < 10; i++) expect(await comment(tx, `Commento ${i}`)).toBeNull();
      expect(await comment(tx, "Uno di troppo")).toContain(COMMENT_RATE_LIMIT);
    });
  });

  it("un amministratore con 2FA cancella un commento altrui e resta traccia", async () => {
    await asUser(db, alice, (tx) => comment(tx, "Da moderare"));
    const commentId = Number(
      (await db.query<{ id: number }>("select id from public.match_comments")).rows[0]!.id,
    );
    await asUser(db, bob, async (tx) =>
      expect(
        await attempt(tx, "select public.moderate_match_comment($1)", [commentId]),
      ).not.toBeNull(),
    );
    await asUser(
      db,
      admin,
      async (tx) =>
        expect(
          await attempt(tx, "select public.moderate_match_comment($1)", [commentId]),
        ).not.toBeNull(),
      "aal1",
    );
    await asUser(db, admin, (tx) =>
      tx.query("select public.moderate_match_comment($1)", [commentId]),
    );
    expect((await db.query("select id from public.match_comments")).rows).toEqual([]);
    const audit = await db.query<{ action: string; target_id: string }>(
      "select action, target_id from public.audit_logs where action = 'comment.moderated'",
    );
    expect(audit.rows).toEqual([{ action: "comment.moderated", target_id: alice.id }]);
  });
});

describe("tipo di avatar e ultimi commenti", () => {
  it("il tipo di avatar si sceglie dall'elenco, solo sul proprio profilo", async () => {
    await asUser(db, alice, async (tx) => {
      await tx.query("update public.profiles set avatar_style = 'outline' where id = $1", [
        alice.id,
      ]);
      expect(
        await attempt(tx, "update public.profiles set avatar_style = 'black' where id = $1", [
          alice.id,
        ]),
      ).toMatch(/profiles_avatar_style_check/);
      const other = await tx.query(
        "update public.profiles set avatar_style = 'ball' where id = $1 returning id",
        [bob.id],
      );
      expect(other.rows).toEqual([]);
    });
  });

  it("gli ultimi commenti di tutte le partite: solo maggiorenni, con le squadre, senza id autore", async () => {
    await asUser(db, alice, (tx) =>
      tx.query("insert into public.match_comments (match_id, body) values ($1, 'Che partita')", [
        matchId,
      ]),
    );
    const feed = (user: TestUser) =>
      asUser(
        db,
        user,
        async (tx) =>
          (await tx.query<Record<string, unknown>>("select * from public.recent_comment_feed(10)"))
            .rows,
      );
    const rows = await feed(bob);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      match_id: matchId,
      home_team: "DEMO Squadra Uno",
      away_team: "DEMO Squadra Due",
      body: "Che partita",
      author_name: "Alice",
      is_own: false,
    });
    expect(Object.keys(rows[0]!)).not.toContain("user_id");
    expect(await feed(young)).toEqual([]);
  });
});
