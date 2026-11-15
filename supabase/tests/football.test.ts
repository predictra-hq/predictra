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

  it("il catalogo provider coincide e i termini sono verificati per tutti", async () => {
    const { rows } = await db.query<{ code: string; verified: boolean; terms_url: string | null }>(
      "select code, terms_verified_at is not null verified, terms_url from public.providers order by code",
    );
    expect(rows.map((r) => r.code)).toEqual([...FOOTBALL_PROVIDERS].sort());
    expect(rows.find((r) => r.code === FD)?.verified).toBe(true);
    // API-Football: termini letti a mano l'11/11/2026 (migrazione 20261111150000).
    expect(rows.find((r) => r.code === "api-football")).toMatchObject({
      verified: true,
      terms_url: "https://www.api-football.com/terms",
    });
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
      expect(p).toBe(3);
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

describe("funzioni di ingestion", () => {
  const OBS1 = "2026-01-10T10:00:00Z";
  const OBS2 = "2026-01-10T13:00:00Z";

  const batch = (observed: string, homePoints = 3) => ({
    observed_at: observed,
    competition: {
      provider_id: "DEMO-C1",
      name: "DEMO Lega",
      code: "DEMO",
      type: "LEAGUE",
      area_name: "DEMO",
      area_code: "ITA",
    },
    season: {
      provider_id: "DEMO-S1",
      label: "2025/26",
      start_date: "2025-08-01",
      end_date: "2026-06-30",
      current_matchday: 1,
    },
    teams: [
      { provider_id: "DEMO-T1", name: "DEMO Squadra Casa", short_name: "DEMO Casa", tla: "DCA" },
      {
        provider_id: "DEMO-T2",
        name: "DEMO Squadra Ospite",
        short_name: "DEMO Ospite",
        tla: "DOS",
      },
    ],
    matches: [
      {
        provider_id: "DEMO-M1",
        matchday: 1,
        stage: "REGULAR_SEASON",
        kickoff_at: "2026-01-09T19:45:00Z",
        status: "FINISHED",
        home_team_provider_id: "DEMO-T1",
        away_team_provider_id: "DEMO-T2",
        home_score: 1,
        away_score: 0,
        score_duration: "REGULAR",
        event_time: "2026-01-09T22:00:00Z",
      },
    ],
    standings: [
      {
        team_provider_id: "DEMO-T1",
        position: 1,
        played: 1,
        won: 1,
        draw: 0,
        lost: 0,
        goals_for: 1,
        goals_against: 0,
        points: homePoints,
      },
      {
        team_provider_id: "DEMO-T2",
        position: 2,
        played: 1,
        won: 0,
        draw: 0,
        lost: 1,
        goals_for: 0,
        goals_against: 1,
        points: 0,
      },
    ],
  });

  const startRun = async (tx: Tx, windowKey = "DEMO:2025") =>
    Number(
      (
        await one<{ id: number }>(
          tx,
          "select public.start_ingestion_run($1, 'fd.competition', $2, 'manual') id",
          [FD, windowKey],
        )
      ).id,
    );

  const ingest = async (tx: Tx, runId: number, b: unknown) =>
    (
      await one<{ r: Record<string, number> }>(
        tx,
        "select public.ingest_football_batch($1, $2) r",
        [runId, JSON.stringify(b)],
      )
    ).r;

  const counts = async (tx: Tx) =>
    one<Record<string, number>>(
      tx,
      `select (select count(*)::int from public.competitions) competitions,
              (select count(*)::int from public.seasons) seasons,
              (select count(*)::int from public.teams) teams,
              (select count(*)::int from public.matches) matches,
              (select count(*)::int from public.standings) standings,
              (select count(*)::int from public.team_aliases) aliases,
              (select count(*)::int from public.provider_entity_map) mappings`,
    );

  it("rifiuta un provider con termini d'uso non verificati", async () => {
    // Provider DEMO senza termini verificati, rimosso alla fine del test.
    await db.exec(
      `insert into public.providers (code, name, website, licence_summary, docs_path)
       values ('demo-non-verificato', 'DEMO', 'https://demo.example', 'DEMO', 'docs/DEMO.md')`,
    );
    try {
      await asServiceRole(db, async (tx) => {
        expect(
          await attempt(
            tx,
            "select public.start_ingestion_run('demo-non-verificato', 'demo.x', 'k')",
          ),
        ).toMatch(/non verificati/);
      });
    } finally {
      await db.exec("delete from public.providers where code = 'demo-non-verificato'");
    }
  });

  it("scrive un lotto e rieseguirlo non duplica nulla", async () => {
    await asServiceRole(db, async (tx) => {
      const run1 = await startRun(tx);
      const r1 = await ingest(tx, run1, batch(OBS1));
      expect(r1).toMatchObject({ teams: 2, matches: 1, standings_inserted: 2 });
      await tx.query("select public.finish_ingestion_run($1, 'SUCCEEDED', 2, 8, 5)", [run1]);
      const after1 = await counts(tx);
      expect(after1).toEqual({
        competitions: 1,
        seasons: 1,
        teams: 2,
        matches: 1,
        standings: 2,
        aliases: 4,
        mappings: 5,
      });

      const run2 = await startRun(tx);
      const r2 = await ingest(tx, run2, batch(OBS2));
      expect(r2).toMatchObject({ standings_inserted: 0, standings_confirmed: 2 });
      expect(await counts(tx)).toEqual(after1);
      const { observed } = await one<{ observed: string }>(
        tx,
        "select max(observed_at)::text observed from public.standings",
      );
      expect(new Date(observed).toISOString()).toBe(new Date(OBS2).toISOString());
    });
  });

  it("una classifica cambiata diventa una nuova fotografia", async () => {
    await asServiceRole(db, async (tx) => {
      await ingest(tx, await startRun(tx, "a"), batch(OBS1));
      const r = await ingest(tx, await startRun(tx, "b"), batch(OBS2, 4));
      expect(r).toMatchObject({ standings_inserted: 2, standings_confirmed: 0 });
      const { n } = await one<{ n: number }>(tx, "select count(*)::int n from public.standings");
      expect(n).toBe(4);
    });
  });

  it("un lotto con una squadra mancante non scrive nulla", async () => {
    await asServiceRole(db, async (tx) => {
      const run = await startRun(tx);
      const bad = batch(OBS1);
      bad.teams = bad.teams.slice(0, 1);
      const err = await attempt(tx, "select public.ingest_football_batch($1, $2)", [
        run,
        JSON.stringify(bad),
      ]);
      expect(err).toMatch(/squadra non presente/);
      expect(await counts(tx)).toMatchObject({ competitions: 0, teams: 0, matches: 0 });
    });
  });

  it("chiude le esecuzioni rimaste aperte e impedisce quelle doppie", async () => {
    await asServiceRole(db, async (tx) => {
      const old = await startRun(tx);
      expect(
        await attempt(tx, "select public.start_ingestion_run($1, 'fd.competition', 'DEMO:2025')", [
          FD,
        ]),
      ).toMatch(/già in corso/);
      await tx.query(
        "update public.ingestion_runs set started_at = now() - interval '2 hours' where id = $1",
        [old],
      );
      const fresh = await startRun(tx);
      const { status } = await one<{ status: string }>(
        tx,
        "select status from public.ingestion_runs where id = $1",
        [old],
      );
      expect(status).toBe("FAILED");
      expect(fresh).not.toBe(old);
      expect(
        await attempt(tx, "select public.finish_ingestion_run($1, 'RUNNING')", [fresh]),
      ).toMatch(/RUNNING/);
    });
  });

  it("i problemi di qualità ripetuti aggiornano quello aperto", async () => {
    await asServiceRole(db, async (tx) => {
      const run = await startRun(tx);
      await ingest(tx, run, batch(OBS1));
      const issue = [
        {
          check_code: "match.score_non_regular",
          severity: "WARNING",
          entity_type: "match",
          provider_entity_id: "DEMO-M1",
          details: { motivo: "DEMO" },
        },
      ];
      await tx.query("select public.report_quality_issues($1, $2)", [run, JSON.stringify(issue)]);
      await tx.query("select public.report_quality_issues($1, $2)", [run, JSON.stringify(issue)]);
      const rows = (
        await tx.query<{ entity_id: number | null }>(
          "select entity_id from public.data_quality_issues",
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.entity_id).not.toBeNull();
    });
  });

  it("ADR 0034: i problemi di punteggio si chiudono quando la partita torna regolare", async () => {
    await asServiceRole(db, async (tx) => {
      const run = await startRun(tx);
      await ingest(tx, run, batch(OBS1));
      const issues = ["DEMO-M1", "DEMO-M2"].map((id) => ({
        check_code: "match.score_non_regular",
        severity: "WARNING",
        entity_type: "match",
        provider_entity_id: id,
        details: { motivo: "DEMO" },
      }));
      await tx.query("select public.report_quality_issues($1, $2)", [run, JSON.stringify(issues)]);
      const closed = await tx.query<{ n: number }>(
        "select public.resolve_quality_issues($1, $2, $3) as n",
        [run, ["match.score_non_regular", "match.score_missing"], ["DEMO-M1"]],
      );
      expect(closed.rows[0]?.n).toBe(1);
      const rows = (
        await tx.query<{ provider_entity_id: string; status: string; resolved: boolean }>(
          `select provider_entity_id, status, resolved_at is not null as resolved
           from public.data_quality_issues order by provider_entity_id`,
        )
      ).rows;
      expect(rows).toEqual([
        { provider_entity_id: "DEMO-M1", status: "RESOLVED", resolved: true },
        { provider_entity_id: "DEMO-M2", status: "OPEN", resolved: false },
      ]);
      // Controlli non indicati restano aperti.
      const none = await tx.query<{ n: number }>(
        "select public.resolve_quality_issues($1, $2, $3) as n",
        [run, ["match.score_missing"], ["DEMO-M2"]],
      );
      expect(none.rows[0]?.n).toBe(0);
    });
  });

  it("gli utenti non possono chiamare le funzioni di ingestion", async () => {
    await asUser(db, superAdmin, async (tx) => {
      for (const sql of [
        "select public.start_ingestion_run('football-data-org', 'x.y', 'k')",
        "select public.ingest_football_batch(1, '{}'::jsonb)",
        "select public.report_quality_issues(1, '[]'::jsonb)",
        "select public.resolve_quality_issues(1, '{}', '{}')",
        "select public.finish_ingestion_run(1, 'FAILED')",
      ]) {
        expect(await attempt(tx, sql), sql).toMatch(/permission denied/);
      }
    });
  });
});
