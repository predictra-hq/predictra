/**
 * Test del contratto M2 (modello canonico del calcio): vincoli, RLS, viste.
 * Tutti i dati inseriti qui sono fittizi ed etichettati DEMO: servono solo a
 * verificare lo schema e non arrivano mai su DEV.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  COMPETITION_TYPES,
  FOOTBALL_DATA_KINDS,
  FOOTBALL_ENTITY_TYPES,
  FOOTBALL_PROVIDERS,
  FRESHNESS_STATUSES,
  INGESTION_RUN_STATUSES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  MATCH_STATUSES,
  QUALITY_STATUSES,
  SCORE_DURATIONS,
  STANDING_TYPES,
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

let db: PGlite;
let alice: TestUser;
let superAdmin: TestUser;

const FD = "football-data-org";

beforeEach(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  superAdmin = await createAuthUser(db, "super@example.test");
  await grantRole(db, alice.id, "USER");
  await grantRole(db, superAdmin.id, "SUPER_ADMIN");
});

const one = async <T>(tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0] as T;

const id = async (tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  Number((await one<{ id: number }>(tx, sql, params)).id);

interface Demo {
  competitionId: number;
  seasonId: number;
  homeId: number;
  awayId: number;
}

/** Anagrafiche DEMO minime: una competizione, una stagione, due squadre. */
async function seedDemo(tx: Tx): Promise<Demo> {
  const competitionId = await id(
    tx,
    `insert into public.competitions (name, code, type, provider, observed_at)
     values ('DEMO Lega', 'DEMO', 'LEAGUE', $1, now()) returning id`,
    [FD],
  );
  const seasonId = await id(
    tx,
    `insert into public.seasons (competition_id, label, start_date, end_date, provider, observed_at)
     values ($1, '2025/26', '2025-08-01', '2026-06-30', $2, now()) returning id`,
    [competitionId, FD],
  );
  const homeId = await id(
    tx,
    `insert into public.teams (name, tla, provider, observed_at)
     values ('DEMO Squadra Casa', 'DCA', $1, now()) returning id`,
    [FD],
  );
  const awayId = await id(
    tx,
    `insert into public.teams (name, tla, provider, observed_at)
     values ('DEMO Squadra Ospite', 'DOS', $1, now()) returning id`,
    [FD],
  );
  return { competitionId, seasonId, homeId, awayId };
}

interface MatchOptions {
  status?: string;
  /** Ore dal momento attuale al calcio d'inizio (negative = nel passato). */
  kickoffHours?: number;
  /** Ore trascorse dall'osservazione. */
  observedHoursAgo?: number;
  score?: [number, number] | null;
  quality?: string;
}

async function insertMatch(tx: Tx, d: Demo, o: MatchOptions = {}): Promise<number> {
  const score = o.score === undefined ? null : o.score;
  return id(
    tx,
    `insert into public.matches
       (competition_id, season_id, matchday, kickoff_at, status, home_team_id, away_team_id,
        home_score, away_score, provider, observed_at, event_time, quality)
     values ($1, $2, 1, now() + make_interval(hours => $3::int), $4::public.match_status, $5, $6,
             $7, $8, $9, now() - make_interval(hours => $10::int),
             now() - make_interval(hours => $10::int), $11::public.quality_status)
     returning id`,
    [
      d.competitionId,
      d.seasonId,
      o.kickoffHours ?? 0,
      o.status ?? "SCHEDULED",
      d.homeId,
      d.awayId,
      score ? score[0] : null,
      score ? score[1] : null,
      FD,
      o.observedHoursAgo ?? 0,
      o.quality ?? "OK",
    ],
  );
}

const enumValues = async (name: string) =>
  (
    await db.query<{ v: string }>(
      `select e.enumlabel v from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = $1 order by e.enumsortorder`,
      [name],
    )
  ).rows.map((r) => r.v);

describe("contratto: tipi condivisi", () => {
  it("gli enum SQL coincidono con packages/shared-types/src/football.ts", async () => {
    expect(await enumValues("quality_status")).toEqual([...QUALITY_STATUSES]);
    expect(await enumValues("freshness_status")).toEqual([...FRESHNESS_STATUSES]);
    expect(await enumValues("competition_type")).toEqual([...COMPETITION_TYPES]);
    expect(await enumValues("match_status")).toEqual([...MATCH_STATUSES]);
    expect(await enumValues("score_duration")).toEqual([...SCORE_DURATIONS]);
    expect(await enumValues("standing_type")).toEqual([...STANDING_TYPES]);
    expect(await enumValues("football_entity_type")).toEqual([...FOOTBALL_ENTITY_TYPES]);
    expect(await enumValues("football_data_kind")).toEqual([...FOOTBALL_DATA_KINDS]);
    expect(await enumValues("ingestion_run_status")).toEqual([...INGESTION_RUN_STATUSES]);
    expect(await enumValues("issue_severity")).toEqual([...ISSUE_SEVERITIES]);
    expect(await enumValues("issue_status")).toEqual([...ISSUE_STATUSES]);
  });

  it("il catalogo provider coincide e solo football-data.org ha i termini verificati", async () => {
    const { rows } = await db.query<{ code: string; verified: boolean }>(
      "select code, terms_verified_at is not null verified from public.providers order by code",
    );
    expect(rows.map((r) => r.code)).toEqual([...FOOTBALL_PROVIDERS].sort());
    expect(rows.find((r) => r.code === FD)?.verified).toBe(true);
    expect(rows.find((r) => r.code === "api-football")?.verified).toBe(false);
  });

  it("la migrazione non inserisce dati calcistici", async () => {
    for (const t of ["competitions", "seasons", "teams", "matches", "standings"]) {
      const { n } = await one<{ n: number }>(db, `select count(*)::int n from public.${t}`);
      expect(n, t).toBe(0);
    }
  });
});

describe("accessi", () => {
  it("anon non legge tabelle né viste", async () => {
    await asAnon(db, async (tx) => {
      for (const rel of ["matches", "providers", "v_match_center", "v_source_health"]) {
        expect(await attempt(tx, `select * from public.${rel}`), rel).toMatch(/permission denied/);
      }
    });
  });

  it("un utente attivo legge partite e viste", async () => {
    await asServiceRole(db, async (tx) => insertMatch(tx, await seedDemo(tx)));
    await asUser(db, alice, async (tx) => {
      const { n } = await one<{ n: number }>(
        tx,
        "select count(*)::int n from public.v_match_center",
      );
      expect(n).toBe(1);
      const { p } = await one<{ p: number }>(
        tx,
        "select count(*)::int p from public.v_source_health",
      );
      expect(p).toBe(2);
    });
  });

  it("un utente sospeso non legge nulla", async () => {
    await asServiceRole(db, async (tx) => insertMatch(tx, await seedDemo(tx)));
    await db.query(
      "update public.profiles set status = 'SUSPENDED', suspended_at = now() where id = $1",
      [alice.id],
    );
    await asUser(db, alice, async (tx) => {
      for (const rel of ["matches", "teams", "providers", "v_match_center"]) {
        const { n } = await one<{ n: number }>(tx, `select count(*)::int n from public.${rel}`);
        expect(n, rel).toBe(0);
      }
    });
  });

  it("nessun utente, nemmeno un Super Admin, scrive dati calcistici", async () => {
    const demo = await asServiceRole(db, seedDemo);
    for (const user of [alice, superAdmin]) {
      await asUser(db, user, async (tx) => {
        expect(
          await attempt(
            tx,
            `insert into public.teams (name, provider, observed_at) values ('DEMO X', $1, now())`,
            [FD],
          ),
        ).toMatch(/permission denied/);
        expect(
          await attempt(tx, "update public.teams set name = 'DEMO Y' where id = $1", [demo.homeId]),
        ).toMatch(/permission denied/);
        expect(await attempt(tx, "delete from public.providers")).toMatch(/permission denied/);
        expect(
          await attempt(
            tx,
            `insert into public.ingestion_runs (provider, job_type, window_key) values ($1, 'x.y', 'k')`,
            [FD],
          ),
        ).toMatch(/permission denied/);
      });
    }
  });
});

describe("vincoli", () => {
  it("una partita non può avere la stessa squadra in casa e fuori", async () => {
    await asServiceRole(db, async (tx) => {
      const d = await seedDemo(tx);
      const err = await attempt(
        tx,
        `insert into public.matches (competition_id, season_id, kickoff_at, status, home_team_id,
           away_team_id, provider, observed_at, event_time)
         values ($1, $2, now(), 'SCHEDULED', $3, $3, $4, now(), now())`,
        [d.competitionId, d.seasonId, d.homeId, FD],
      );
      expect(err).toMatch(/matches_distinct_teams/);
    });
  });

  it("il punteggio è sempre una coppia e mai negativo", async () => {
    await asServiceRole(db, async (tx) => {
      const d = await seedDemo(tx);
      const base = `insert into public.matches (competition_id, season_id, kickoff_at, status,
          home_team_id, away_team_id, home_score, away_score, provider, observed_at, event_time)
        values ($1, $2, now(), 'FINISHED', $3, $4, $5, $6, $7, now(), now())`;
      expect(
        await attempt(tx, base, [d.competitionId, d.seasonId, d.homeId, d.awayId, 1, null, FD]),
      ).toMatch(/matches_score_pair/);
      expect(
        await attempt(tx, base, [d.competitionId, d.seasonId, d.homeId, d.awayId, -1, 0, FD]),
      ).toMatch(/check constraint/);
    });
  });

  it("provider_entity_map accetta solo entità esistenti, una per provider", async () => {
    await asServiceRole(db, async (tx) => {
      const d = await seedDemo(tx);
      const ins = `insert into public.provider_entity_map (provider, entity_type, provider_entity_id, entity_id)
                   values ($1, 'team', $2, $3)`;
      expect(await attempt(tx, ins, [FD, "1", 999_999])).toMatch(/inesistente/);
      expect(await attempt(tx, ins, [FD, "1", d.homeId])).toBeNull();
      // Stesso ID provider di nuovo: viola la chiave primaria (upsert idempotente).
      expect(await attempt(tx, ins, [FD, "1", d.awayId])).toMatch(/duplicate key/);
      // La stessa squadra con un secondo ID dello stesso provider: rifiutata.
      expect(await attempt(tx, ins, [FD, "2", d.homeId])).toMatch(/duplicate key/);
    });
  });

  it("gli alias si confrontano normalizzati", async () => {
    await asServiceRole(db, async (tx) => {
      const d = await seedDemo(tx);
      const ins =
        "insert into public.team_aliases (team_id, alias, source) values ($1, $2, 'manual')";
      expect(await attempt(tx, ins, [d.homeId, "DEMO  Casa"])).toBeNull();
      expect(await attempt(tx, ins, [d.homeId, " demo casa "])).toMatch(/team_aliases_unique/);
    });
  });

  it("al più un'esecuzione in corso per lo stesso lavoro", async () => {
    await asServiceRole(db, async (tx) => {
      const ins = `insert into public.ingestion_runs (provider, job_type, window_key)
                   values ($1, 'fd.matches', 'DEMO:2025')`;
      expect(await attempt(tx, ins, [FD])).toBeNull();
      expect(await attempt(tx, ins, [FD])).toMatch(/ingestion_runs_one_running/);
      await tx.query(
        "update public.ingestion_runs set status = 'SUCCEEDED', finished_at = now() where window_key = 'DEMO:2025'",
      );
      expect(await attempt(tx, ins, [FD])).toBeNull();
      expect(
        await attempt(
          tx,
          "update public.ingestion_runs set status = 'FAILED' where status = 'RUNNING'",
        ),
      ).toMatch(/ingestion_runs_finished_consistency/);
    });
  });

  it("al più un problema di qualità aperto per controllo ed entità", async () => {
    await asServiceRole(db, async (tx) => {
      const d = await seedDemo(tx);
      const m = await insertMatch(tx, d);
      const ins = `insert into public.data_quality_issues (provider, entity_type, entity_id, check_code, severity)
                   values ($1, 'match', $2, 'match.score_missing', 'ERROR')`;
      expect(await attempt(tx, ins, [FD, m])).toBeNull();
      expect(await attempt(tx, ins, [FD, m])).toMatch(/data_quality_issues_one_open/);
      await tx.query(
        "update public.data_quality_issues set status = 'RESOLVED', resolved_at = now()",
      );
      expect(await attempt(tx, ins, [FD, m])).toBeNull();
    });
  });
});

describe("viste", () => {
  it("v_match_center espone provenienza, ID del provider e freschezza", async () => {
    await asServiceRole(db, async (tx) => {
      const d = await seedDemo(tx);
      const fresh = await insertMatch(tx, d, { kickoffHours: 48 });
      const stale = await insertMatch(tx, d, {
        kickoffHours: 72,
        observedHoursAgo: 7,
      });
      const oldFinished = await insertMatch(tx, d, {
        status: "FINISHED",
        kickoffHours: -240,
        observedHoursAgo: 216,
        score: [2, 1],
      });
      await tx.query(
        `insert into public.provider_entity_map (provider, entity_type, provider_entity_id, entity_id)
         values ($1, 'match', 'DEMO-1', $2)`,
        [FD, fresh],
      );
      const rows = (
        await tx.query<{ match_id: number; freshness: string; provider_match_id: string | null }>(
          "select match_id, freshness, provider_match_id from public.v_match_center",
        )
      ).rows;
      const byId = new Map(rows.map((r) => [Number(r.match_id), r]));
      expect(byId.get(fresh)).toMatchObject({ freshness: "FRESH", provider_match_id: "DEMO-1" });
      expect(byId.get(stale)?.freshness).toBe("STALE");
      expect(byId.get(oldFinished)?.freshness).toBe("FRESH");
    });
  });

  it("v_match_results contiene solo partite concluse, con risultato e senza errori", async () => {
    await asServiceRole(db, async (tx) => {
      const d = await seedDemo(tx);
      const ok = await insertMatch(tx, d, { status: "FINISHED", score: [1, 0] });
      await insertMatch(tx, d, { status: "FINISHED", score: [3, 3], quality: "ERROR" });
      await insertMatch(tx, d, { status: "SCHEDULED" });
      await insertMatch(tx, d, { status: "POSTPONED" });
      const { rows } = await tx.query<{ match_id: number }>(
        "select match_id from public.v_match_results",
      );
      expect(rows.map((r) => Number(r.match_id))).toEqual([ok]);
    });
  });

  it("v_latest_standings mostra solo l'ultima fotografia", async () => {
    await asServiceRole(db, async (tx) => {
      const d = await seedDemo(tx);
      const ins = `insert into public.standings (competition_id, season_id, team_id, position, played,
          won, draw, lost, goals_for, goals_against, points, provider, observed_at, event_time)
        values ($1, $2, $3, $4, $5, $5, 0, 0, $5, 0, $6, $7, $8::timestamptz, $8::timestamptz)`;
      await tx.query(ins, [
        d.competitionId,
        d.seasonId,
        d.homeId,
        1,
        1,
        3,
        FD,
        "2026-01-01T10:00:00Z",
      ]);
      await tx.query(ins, [
        d.competitionId,
        d.seasonId,
        d.homeId,
        1,
        2,
        6,
        FD,
        "2026-01-08T10:00:00Z",
      ]);
      await tx.query(ins, [
        d.competitionId,
        d.seasonId,
        d.awayId,
        2,
        2,
        0,
        FD,
        "2026-01-08T10:00:00Z",
      ]);
      const { rows } = await tx.query<{ team_id: number; points: number; freshness: string }>(
        "select team_id, points, freshness from public.v_latest_standings order by position",
      );
      expect(rows.map((r) => [Number(r.team_id), r.points])).toEqual([
        [d.homeId, 6],
        [d.awayId, 0],
      ]);
      expect(rows[0]?.freshness).toBe("STALE");
    });
  });

  it("v_source_health passa da NO_DATA a OK e a DEGRADED", async () => {
    const health = async (tx: Tx) =>
      await one<{ health: string; freshness: string | null; requests_24h: number }>(
        tx,
        "select health, freshness, requests_24h from public.v_source_health where provider = $1",
        [FD],
      );
    await asServiceRole(db, async (tx) => {
      expect(await health(tx)).toMatchObject({ health: "NO_DATA", freshness: null });

      await tx.query(
        `insert into public.ingestion_runs (provider, job_type, window_key, status, started_at,
           finished_at, requests_used)
         values ($1, 'fd.matches', 'DEMO:a', 'SUCCEEDED', now() - interval '5 minutes', now(), 3)`,
        [FD],
      );
      expect(await health(tx)).toMatchObject({ health: "OK", freshness: "FRESH", requests_24h: 3 });

      await tx.query(
        `insert into public.ingestion_runs (provider, job_type, window_key, status, finished_at,
           requests_used, error_summary)
         values ($1, 'fd.matches', 'DEMO:b', 'FAILED', now(), 1, 'HTTP 429')`,
        [FD],
      );
      expect(await health(tx)).toMatchObject({ health: "DEGRADED", requests_24h: 4 });
    });
  });
});
