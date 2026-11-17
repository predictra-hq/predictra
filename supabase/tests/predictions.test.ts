/**
 * Test del contratto M4 (versioni, previsioni, backtest). Dati fittizi DEMO.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { MODEL_KEYS, MODEL_STATUSES, PREDICTION_MARKETS } from "@predictra/shared-types";
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

const FD = "football-data-org";
const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);
const COMMIT = "abc1234";

let db: PGlite;
let alice: TestUser;
let superAdmin: TestUser;
let admin: TestUser;

const one = async <T>(tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0] as T;
const num = async (tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  Number((await one<{ v: number }>(tx, sql, params)).v);

beforeEach(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  superAdmin = await createAuthUser(db, "super@example.test");
  admin = await createAuthUser(db, "admin@example.test");
  await grantRole(db, alice.id, "USER");
  await grantRole(db, superAdmin.id, "SUPER_ADMIN");
  await grantRole(db, admin.id, "ADMIN");
});

/** Partite DEMO: due concluse e una in programma (calcio d'inizio 2026-11-20 20:00 UTC). */
async function seedMatches(tx: Tx): Promise<{ upcoming: number }> {
  const run = await num(
    tx,
    "select public.start_ingestion_run($1, 'fd.competition', 'DEMO', 'manual') v",
    [FD],
  );
  const team = (id: string) => ({ provider_id: id, name: `DEMO Squadra ${id}` });
  const match = (id: string, kickoff: string, status: string, score?: [number, number]) => ({
    provider_id: id,
    matchday: 1,
    kickoff_at: kickoff,
    status,
    home_team_provider_id: "T1",
    away_team_provider_id: "T2",
    home_score: score?.[0] ?? null,
    away_score: score?.[1] ?? null,
    event_time: kickoff,
  });
  await tx.query("select public.ingest_football_batch($1, $2)", [
    run,
    JSON.stringify({
      observed_at: "2026-11-08T10:00:00Z",
      competition: { provider_id: "C1", name: "DEMO Lega", code: "DEMO", type: "LEAGUE" },
      season: {
        provider_id: "S1",
        label: "2026/27",
        start_date: "2026-08-01",
        end_date: "2027-06-30",
      },
      teams: [team("T1"), team("T2")],
      matches: [
        match("M1", "2026-09-01T18:00:00Z", "FINISHED", [2, 0]),
        match("M2", "2026-10-01T18:00:00Z", "FINISHED", [1, 1]),
        match("M3", "2026-11-20T20:00:00Z", "SCHEDULED"),
      ],
    }),
  ]);
  await tx.query("select public.finish_ingestion_run($1, 'SUCCEEDED')", [run]);
  const upcoming = await num(
    tx,
    "select m.id v from public.matches m where m.status = 'SCHEDULED'",
  );
  return { upcoming };
}

const version = (key: string, ver: string, hash = HASH) => ({
  model_key: key,
  version: ver,
  code_commit: COMMIT,
  parameters: { home_advantage: 0.25 },
  training_window_start: "2026-08-01T00:00:00Z",
  training_window_end: "2026-11-01T00:00:00Z",
  training_data_hash: hash,
  training_matches: 2,
});

const register = (tx: Tx, v: unknown) =>
  num(tx, "select public.register_model_version($1) v", [JSON.stringify(v)]);

const prediction = (matchId: number, over: Record<string, unknown> = {}) => ({
  match_id: matchId,
  market: "1X2",
  line: null,
  selection: "HOME",
  probability: 0.45,
  push_probability: null,
  confidence_score: 0.35,
  explanation: { componenti: { campione: 0.1 } },
  features_hash: HASH,
  as_of: "2026-11-19T12:00:00Z",
  ...over,
});

const backtest = (modelId: number, brier: number, logLoss: number) => ({
  model_version_id: modelId,
  window_start: "2026-09-01T00:00:00Z",
  window_end: "2026-11-01T00:00:00Z",
  matches: 2,
  brier,
  log_loss: logLoss,
  ece: 0.05,
  baseline_brier: 0.66,
  baseline_log_loss: 1.09,
  calibration: [],
  code_commit: COMMIT,
});

describe("contratto previsioni", () => {
  it("enum e mercati coincidono con i tipi condivisi", async () => {
    const values = async (t: string) =>
      (
        await db.query<{ v: string }>(
          `select e.enumlabel v from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = $1 order by e.enumsortorder`,
          [t],
        )
      ).rows.map((r) => r.v);
    expect(await values("model_status")).toEqual([...MODEL_STATUSES]);
    const checks = (
      await db.query<{ def: string }>(
        `select pg_get_constraintdef(oid) def from pg_constraint
         where conrelid in ('public.predictions'::regclass, 'public.model_versions'::regclass)
           and contype = 'c'`,
      )
    ).rows
      .map((r) => r.def)
      .join("\n");
    for (const market of PREDICTION_MARKETS) expect(checks).toContain(`'${market}'`);
    for (const key of MODEL_KEYS) expect(checks).toContain(`'${key}'`);
  });

  it("anon non legge; gli utenti non scrivono né chiamano le funzioni del motore", async () => {
    await asAnon(db, async (tx) => {
      expect(await attempt(tx, "select * from public.v_active_predictions")).toMatch(
        /permission denied/,
      );
    });
    await asUser(db, superAdmin, async (tx) => {
      expect(await attempt(tx, "select public.register_model_version('{}'::jsonb)")).toMatch(
        /permission denied/,
      );
      expect(
        await attempt(tx, "insert into public.backtests (model_version_id) values (1)"),
      ).toMatch(/permission denied/);
    });
  });
});

describe("versioni dei modelli", () => {
  it("registrazione idempotente, conflitto se cambiano i dati", async () => {
    await asServiceRole(db, async (tx) => {
      const a = await register(tx, version("elo", "v1"));
      expect(await register(tx, version("elo", "v1"))).toBe(a);
      expect(
        await attempt(tx, "select public.register_model_version($1)", [
          JSON.stringify(version("elo", "v1", HASH2)),
        ]),
      ).toMatch(/già registrata/);
    });
  });

  it("una versione è immutabile e non si cancella", async () => {
    await asServiceRole(db, async (tx) => {
      const a = await register(tx, version("elo", "v1"));
      expect(
        await attempt(tx, "update public.model_versions set parameters = '{}' where id = $1", [a]),
      ).toMatch(/immutabile/);
      expect(
        await attempt(tx, "delete from public.model_versions where id = $1", [a]),
      ).not.toBeNull();
    });
  });
});

describe("previsioni", () => {
  it("scrittura idempotente e immutabile", async () => {
    await asServiceRole(db, async (tx) => {
      const { upcoming } = await seedMatches(tx);
      const mv = await register(tx, version("dixon_coles", "v1"));
      const run = await num(tx, "select public.start_prediction_run($1, $2, 'manual') v", [
        mv,
        COMMIT,
      ]);
      const batch = {
        predictions: [
          prediction(upcoming),
          prediction(upcoming, { selection: "DRAW", probability: 0.28 }),
          prediction(upcoming, { selection: "AWAY", probability: 0.27 }),
          prediction(upcoming, {
            market: "ASIAN_HANDICAP",
            line: 0,
            selection: "HOME",
            probability: 0.45,
            push_probability: 0.28,
          }),
        ],
        score_matrices: [
          {
            match_id: upcoming,
            as_of: "2026-11-19T12:00:00Z",
            lambda_home: 1.4,
            lambda_away: 1.1,
            rho: -0.05,
            max_goals: 1,
            matrix: [
              [0.3, 0.2],
              [0.3, 0.2],
            ],
          },
        ],
      };
      const r1 = await one<{ r: Record<string, number> }>(
        tx,
        "select public.record_predictions($1, $2) r",
        [run, JSON.stringify(batch)],
      );
      expect(r1.r).toEqual({ predictions: 4, score_matrices: 1 });
      const r2 = await one<{ r: Record<string, number> }>(
        tx,
        "select public.record_predictions($1, $2) r",
        [run, JSON.stringify(batch)],
      );
      expect(r2.r).toEqual({ predictions: 0, score_matrices: 0 });
      expect(await attempt(tx, "update public.predictions set probability = 0.9")).toMatch(
        /immutabile/,
      );
      expect(await attempt(tx, "delete from public.predictions")).toMatch(/immutabile/);
      await tx.query("select public.finish_prediction_run($1, 'SUCCEEDED', 1)", [run]);
      expect(
        await num(tx, "select predictions_written v from public.prediction_runs where id = $1", [
          run,
        ]),
      ).toBe(4);
    });
  });

  it("anti-leakage: nessuna previsione con dati successivi al calcio d'inizio", async () => {
    await asServiceRole(db, async (tx) => {
      const { upcoming } = await seedMatches(tx);
      const mv = await register(tx, version("elo", "v1"));
      const run = await num(tx, "select public.start_prediction_run($1, $2) v", [mv, COMMIT]);
      const err = await attempt(tx, "select public.record_predictions($1, $2)", [
        run,
        JSON.stringify({ predictions: [prediction(upcoming, { as_of: "2026-11-20T20:01:00Z" })] }),
      ]);
      expect(err).toMatch(/Leakage/);
    });
  });

  it("vincoli: probabilità, linee e push", async () => {
    await asServiceRole(db, async (tx) => {
      const { upcoming } = await seedMatches(tx);
      const mv = await register(tx, version("elo", "v1"));
      const run = await num(tx, "select public.start_prediction_run($1, $2) v", [mv, COMMIT]);
      const bad = async (over: Record<string, unknown>) =>
        attempt(tx, "select public.record_predictions($1, $2)", [
          run,
          JSON.stringify({ predictions: [prediction(upcoming, over)] }),
        ]);
      expect(await bad({ probability: 1.2 })).not.toBeNull();
      expect(await bad({ market: "TOTAL_GOALS", line: null })).toMatch(/predictions_line_markets/);
      expect(await bad({ line: 2.5 })).toMatch(/predictions_line_markets/);
      expect(await bad({ market: "ASIAN_HANDICAP", line: 0.25 })).not.toBeNull();
      expect(await bad({ probability: 0.8, push_probability: 0.3 })).toMatch(/probability_total/);
      expect(await bad({ market: "CORNERS" })).not.toBeNull();
    });
  });

  it("training_results restituisce solo partite concluse prima di as_of", async () => {
    await asServiceRole(db, async (tx) => {
      await seedMatches(tx);
      expect(
        await num(
          tx,
          "select count(*)::int v from public.training_results('2026-09-15T00:00:00Z')",
        ),
      ).toBe(1);
      expect(
        await num(
          tx,
          "select count(*)::int v from public.training_results('2026-12-01T00:00:00Z')",
        ),
      ).toBe(2);
    });
  });
});

describe("modello attivo", () => {
  async function setup() {
    return asServiceRole(db, async (tx) => {
      const { upcoming } = await seedMatches(tx);
      const good = await register(tx, version("dixon_coles", "v1"));
      const weak = await register(tx, version("elo", "v1"));
      await tx.query("select public.record_backtest($1)", [
        JSON.stringify(backtest(good, 0.6, 1.0)),
      ]);
      await tx.query("select public.record_backtest($1)", [
        JSON.stringify(backtest(weak, 0.7, 1.0)),
      ]);
      const run = await num(tx, "select public.start_prediction_run($1, $2) v", [good, COMMIT]);
      await tx.query("select public.record_predictions($1, $2)", [
        run,
        JSON.stringify({ predictions: [prediction(upcoming)] }),
      ]);
      return { good, weak };
    });
  }

  it("solo un Super Admin con 2FA attiva un modello migliore della baseline", async () => {
    const { good, weak } = await setup();
    for (const user of [alice, admin]) {
      await asUser(db, user, async (tx) => {
        expect(
          await attempt(tx, "select public.set_active_model_version($1)", [good]),
        ).not.toBeNull();
      });
    }
    await asUser(
      db,
      superAdmin,
      async (tx) => {
        expect(
          await attempt(tx, "select public.set_active_model_version($1)", [good]),
        ).not.toBeNull();
      },
      "aal1",
    );
    await asUser(db, superAdmin, async (tx) => {
      expect(await attempt(tx, "select public.set_active_model_version($1)", [weak])).toMatch(
        /baseline/,
      );
      await tx.query("select public.set_active_model_version($1)", [good]);
    });
    await asUser(db, alice, async (tx) => {
      const rows = (
        await tx.query<{ model_key: string }>("select model_key from public.v_active_predictions")
      ).rows;
      expect(rows.map((r) => r.model_key)).toEqual(["dixon_coles"]);
      const s = await one<{ beats: boolean; status: string }>(
        tx,
        "select beats_baseline beats, status from public.v_model_versions_summary where model_version_id = $1",
        [good],
      );
      expect(s).toEqual({ beats: true, status: "ACTIVE" });
    });
    expect(
      await num(
        db,
        "select count(*)::int v from public.audit_logs where action = 'model.activated'",
      ),
    ).toBe(1);
  });

  it("attivarne un altro rimette in gara il precedente: mai due attivi, si torna indietro", async () => {
    const { good } = await setup();
    const other = await asServiceRole(db, async (tx) => {
      const id = await register(tx, version("poisson", "v1"));
      await tx.query("select public.record_backtest($1)", [
        JSON.stringify(backtest(id, 0.61, 1.01)),
      ]);
      return id;
    });
    await asUser(db, superAdmin, async (tx) => {
      await tx.query("select public.set_active_model_version($1)", [good]);
      await tx.query("select public.set_active_model_version($1)", [other]);
    });
    const rows = (
      await db.query<{ id: number; status: string }>(
        "select id, status::text from public.model_versions order by id",
      )
    ).rows;
    expect(rows.filter((r) => r.status === "ACTIVE").map((r) => Number(r.id))).toEqual([other]);
    // Il precedente resta lo sfidante (non ritirato) e si può riattivare.
    expect(rows.find((r) => Number(r.id) === good)?.status).toBe("CANDIDATE");
    await asUser(db, superAdmin, async (tx) => {
      await tx.query("select public.set_active_model_version($1)", [good]);
    });
    const after = (
      await db.query<{ id: number; status: string }>(
        "select id, status::text from public.model_versions where id in ($1, $2) order by id",
        [good, other],
      )
    ).rows.map((r) => [Number(r.id), r.status]);
    expect(after).toEqual([
      [good, "ACTIVE"],
      [other, "CANDIDATE"],
    ]);
  });
  it("attivazione automatica del più forte (ADR 0023): solo service_role, stesse garanzie, audit", async () => {
    const { good, weak } = await setup();
    // Utenti, anche Super Admin con 2FA, non possono chiamarla.
    for (const user of [alice, superAdmin]) {
      await asUser(db, user, async (tx) => {
        expect(
          await attempt(tx, "select public.auto_activate_model_version($1, 'DEMO')", [good]),
        ).not.toBeNull();
      });
    }
    await asServiceRole(db, async (tx) => {
      expect(
        await attempt(tx, "select public.auto_activate_model_version($1, 'DEMO')", [weak]),
      ).toMatch(/baseline/);
      await tx.query("select public.auto_activate_model_version($1, $2)", [
        good,
        "DEMO: nessun modello attivo",
      ]);
      // Ripetere sulla stessa versione non fa nulla.
      await tx.query("select public.auto_activate_model_version($1, 'DEMO')", [good]);
    });
    const active = await one<{ id: number; by: string | null }>(
      db,
      "select id, activated_by by from public.model_versions where status = 'ACTIVE'",
    );
    expect(Number(active.id)).toBe(good);
    expect(active.by).toBeNull();
    const audit = await one<{ n: number; reason: string }>(
      db,
      `select count(*)::int n, min(metadata ->> 'reason') reason from public.audit_logs
       where action = 'model.auto_activated'`,
    );
    expect(audit).toEqual({ n: 1, reason: "DEMO: nessun modello attivo" });
  });
  it("le versioni superate si ritirano (ADR 0024): solo service_role, l'attiva non si tocca", async () => {
    const { good, weak } = await setup();
    const extra = await asServiceRole(db, async (tx) => register(tx, version("poisson", "v1")));
    await asServiceRole(db, async (tx) => {
      await tx.query("select public.auto_activate_model_version($1, 'DEMO')", [good]);
    });
    await asUser(db, superAdmin, async (tx) => {
      expect(
        await attempt(tx, "select public.retire_superseded_model_versions($1)", [[extra]]),
      ).not.toBeNull();
    });
    const n = await asServiceRole(db, async (tx) =>
      num(tx, "select public.retire_superseded_model_versions($1) v", [[extra]]),
    );
    expect(n).toBe(1); // weak ritirata; good è attiva, extra è da tenere
    const rows = (
      await db.query<{ id: number; status: string }>(
        "select id, status::text from public.model_versions order by id",
      )
    ).rows.map((r) => [Number(r.id), r.status]);
    expect(rows).toEqual([
      [good, "ACTIVE"],
      [weak, "RETIRED"],
      [extra, "CANDIDATE"],
    ]);
    expect(
      await num(
        db,
        "select count(*)::int v from public.audit_logs where action = 'model.versions_retired'",
      ),
    ).toBe(1);
  });
});

describe("previsioni prima del calcio d'inizio", () => {
  it("restano visibili dopo il cambio di versione dello stesso modello, solo per chi è attivo", async () => {
    const { v1, v2 } = await asServiceRole(db, async (tx) => {
      const { upcoming } = await seedMatches(tx);
      const v1 = await register(tx, version("dixon_coles", "v1"));
      const v2 = await register(tx, version("dixon_coles", "v2", HASH2));
      const elo = await register(tx, version("elo", "v1"));
      for (const id of [v1, v2, elo]) {
        await tx.query("select public.record_backtest($1)", [
          JSON.stringify(backtest(id, 0.6, 1.0)),
        ]);
      }
      for (const id of [v1, elo]) {
        const run = await num(tx, "select public.start_prediction_run($1, $2) v", [id, COMMIT]);
        await tx.query("select public.record_predictions($1, $2)", [
          run,
          JSON.stringify({ predictions: [prediction(upcoming)] }),
        ]);
      }
      return { v1, v2 };
    });
    await asUser(db, superAdmin, async (tx) => {
      await tx.query("select public.set_active_model_version($1)", [v1]);
      await tx.query("select public.set_active_model_version($1)", [v2]);
    });
    await asUser(db, alice, async (tx) => {
      expect(await num(tx, "select count(*)::int v from public.v_active_predictions")).toBe(0);
      const rows = (
        await tx.query<{ model_key: string; model_version: string }>(
          "select model_key, model_version from public.v_pre_kickoff_predictions",
        )
      ).rows;
      expect(rows).toEqual([{ model_key: "dixon_coles", model_version: "v1" }]);
    });
    await asAnon(db, async (tx) => {
      expect(await attempt(tx, "select * from public.v_pre_kickoff_predictions")).toMatch(
        /permission denied/,
      );
    });
  });
});

describe("conservazione delle previsioni (ADR 0041)", () => {
  it("cancella solo le previsioni superate e vecchie, mai l'ultima né quelle in una schedina", async () => {
    let finished = 0;
    let upcoming = 0;
    let run = 0;
    let mv = 0;
    await asServiceRole(db, async (tx) => {
      ({ upcoming } = await seedMatches(tx));
      finished = await num(
        tx,
        "select id v from public.matches where status = 'FINISHED' order by kickoff_at limit 1",
      );
      mv = await register(tx, version("dixon_coles", "v1"));
      run = await num(tx, "select public.start_prediction_run($1, $2, 'manual') v", [mv, COMMIT]);
    });
    // Righe con date di creazione nel passato: inserite dal proprietario del database.
    const insert = (match: number, asOf: string, createdAt: string, probability = 0.45) =>
      num(
        db,
        `insert into public.predictions (match_id, model_version_id, prediction_run_id, market, line,
           selection, probability, confidence_score, features_hash, as_of, created_at)
         values ($1, $2, $3, '1X2', null, 'HOME', $4, 0.4, $5, $6, $7) returning id v`,
        [match, mv, run, probability, HASH, asOf, createdAt],
      );
    const finishedOld = await insert(finished, "2026-08-20T10:00:00Z", "2020-01-01T00:00:00Z");
    const finishedLast = await insert(finished, "2026-08-30T10:00:00Z", "2020-01-02T00:00:00Z");
    const upcomingOld = await insert(upcoming, "2026-11-10T10:00:00Z", "2020-01-01T00:00:00Z");
    const upcomingInSlip = await insert(upcoming, "2026-11-11T10:00:00Z", "2020-01-01T00:00:00Z");
    const upcomingRecent = await insert(upcoming, "2026-11-12T10:00:00Z", new Date().toISOString());
    const upcomingLast = await insert(upcoming, "2026-11-13T10:00:00Z", "2020-01-03T00:00:00Z");

    // Una schedina di Alice usa una previsione superata: deve restare.
    await asUser(db, alice, async (tx) => {
      const slip = await num(
        tx,
        "insert into public.user_bet_slips (name) values ('DEMO') returning id v",
      );
      await tx.query(
        `insert into public.user_bet_slip_selections (slip_id, leg_no, match_id, market, selection, prediction_id)
         values ($1, 1, $2, '1X2', 'HOME', $3)`,
        [slip, upcoming, upcomingInSlip],
      );
    });

    // Solo il motore può chiamarla.
    await asUser(db, alice, async (tx) => {
      expect(await attempt(tx, "select public.prune_predictions()")).toMatch(/permission denied/);
    });

    await asServiceRole(db, async (tx) => {
      const r = await one<{ r: Record<string, number> }>(
        tx,
        "select public.prune_predictions(7) r",
      );
      expect(r.r).toEqual({ predictions: 2, score_matrices: 0 });
      const left = (
        await tx.query<{ id: number }>("select id from public.predictions order by id")
      ).rows.map((x) => Number(x.id));
      expect(left).toEqual([finishedLast, upcomingInSlip, upcomingRecent, upcomingLast]);
      expect(left).not.toContain(finishedOld);
      expect(left).not.toContain(upcomingOld);
      // Fuori dalla pulizia la tabella resta immutabile.
      expect(await attempt(tx, "delete from public.predictions")).toMatch(/immutabile/);
      // Seconda chiamata: niente da fare.
      const again = await one<{ r: Record<string, number> }>(
        tx,
        "select public.prune_predictions(7) r",
      );
      expect(again.r).toEqual({ predictions: 0, score_matrices: 0 });
    });
  });
});
