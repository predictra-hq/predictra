/**
 * Test del contratto M5 (Smart Bet Builder). Dati fittizi etichettati DEMO:
 * verificano lo schema e non arrivano mai su DEV.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  BET_PROPOSAL_CATEGORIES,
  BET_PROPOSAL_KINDS,
  DEFAULT_BET_BUILDER_RULES,
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

const FD = "football-data-org";
const ODDS = "the-odds-api";
const HASH = "a".repeat(64);
const COMMIT = "abc1234";
const HOUR = 3_600_000;

let db: PGlite;
let alice: TestUser;
let bob: TestUser;
let admin: TestUser;
let superAdmin: TestUser;

const one = async <T>(tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0] as T;
const num = async (tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  Number((await one<{ v: number }>(tx, sql, params)).v);
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

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

interface Seed {
  model: number;
  m1: number;
  m2: number;
  m3: number;
  pred: Record<string, number>;
  odds: Record<string, number>;
}

/**
 * Due partite DEMO in programma (tra 2 giorni), quote 1X2 lette un'ora fa,
 * un modello attivo e le sue previsioni 1X2.
 *   M1: casa 2,50 / pareggio 3,40 / ospite 3,00 — modello 0,50 / 0,25 / 0,25
 *   M2: casa 2,20 / pareggio 3,30 / ospite 3,60 — modello 0,55 / 0,25 / 0,20
 *   M3 (T1 di nuovo, tra 3 giorni): casa 2,00 / 3,50 / 4,00 — modello 0,60 / 0,25 / 0,15
 */
async function seed(tx: Tx, oddsObservedOffset = -HOUR): Promise<Seed> {
  const k1 = iso(48 * HOUR);
  const k2 = iso(50 * HOUR);
  const k3 = iso(72 * HOUR);
  const fdRun = await num(
    tx,
    "select public.start_ingestion_run($1, 'fd.competition', 'DEMO', 'manual') v",
    [FD],
  );
  const team = (id: string) => ({ provider_id: id, name: `DEMO Squadra ${id}` });
  const match = (id: string, kickoff: string, home: string, away: string) => ({
    provider_id: id,
    matchday: 12,
    kickoff_at: kickoff,
    status: "SCHEDULED",
    home_team_provider_id: home,
    away_team_provider_id: away,
    event_time: iso(-2 * HOUR),
  });
  await tx.query("select public.ingest_football_batch($1, $2)", [
    fdRun,
    JSON.stringify({
      observed_at: iso(-2 * HOUR),
      competition: { provider_id: "C1", name: "DEMO Lega", code: "DEMO", type: "LEAGUE" },
      season: {
        provider_id: "S1",
        label: "2026/27",
        start_date: "2026-08-01",
        end_date: "2027-06-30",
      },
      teams: [team("T1"), team("T2"), team("T3"), team("T4")],
      matches: [
        match("M1", k1, "T1", "T2"),
        match("M2", k2, "T3", "T4"),
        match("M3", k3, "T1", "T3"),
      ],
    }),
  ]);
  await tx.query("select public.finish_ingestion_run($1, 'SUCCEEDED')", [fdRun]);

  const event = (id: string, kickoff: string, home: string, away: string, prices: number[]) => ({
    provider_event_id: id,
    commence_time: kickoff,
    home_team: `DEMO Squadra ${home}`,
    away_team: `DEMO Squadra ${away}`,
    bookmakers: [
      {
        key: "demo_it",
        title: "DEMO (IT)",
        region: "eu",
        markets: [
          {
            key: "h2h",
            last_update: iso(oddsObservedOffset - 5 * 60_000),
            outcomes: [
              { selection: "HOME", price: prices[0] },
              { selection: "DRAW", price: prices[1] },
              { selection: "AWAY", price: prices[2] },
            ],
          },
        ],
      },
    ],
  });
  const oddsRun = await num(
    tx,
    "select public.start_ingestion_run($1, 'odds.h2h', 'DEMO', 'manual') v",
    [ODDS],
  );
  await tx.query("select public.ingest_odds_batch($1, $2)", [
    oddsRun,
    JSON.stringify({
      observed_at: iso(oddsObservedOffset),
      competition_code: "DEMO",
      sport_key: "soccer_demo",
      events: [
        event("E1", k1, "T1", "T2", [2.5, 3.4, 3.0]),
        event("E2", k2, "T3", "T4", [2.2, 3.3, 3.6]),
        event("E3", k3, "T1", "T3", [2.0, 3.5, 4.0]),
      ],
    }),
  ]);
  await tx.query("select public.finish_ingestion_run($1, 'SUCCEEDED')", [oddsRun]);

  const model = await num(tx, "select public.register_model_version($1) v", [
    JSON.stringify({
      model_key: "dixon_coles",
      version: "v1",
      code_commit: COMMIT,
      parameters: {},
      training_window_start: "2026-08-01T00:00:00Z",
      training_window_end: "2026-11-01T00:00:00Z",
      training_data_hash: HASH,
      training_matches: 100,
    }),
  ]);
  // Attivazione diretta (setup di test): il percorso reale è set_active_model_version (M4).
  await tx.query(
    "update public.model_versions set status = 'ACTIVE', activated_at = now() where id = $1",
    [model],
  );

  const [m1, m2, m3] = (
    await tx.query<{ id: number }>("select id from public.matches order by kickoff_at")
  ).rows.map((r) => Number(r.id)) as [number, number, number];
  const label = (col: string) =>
    `case ${col} when $1 then 'M1' when $2 then 'M2' when $3 then 'M3' end`;
  const predRun = await num(tx, "select public.start_prediction_run($1, $2, 'manual') v", [
    model,
    COMMIT,
  ]);
  const p = (matchId: number, selection: string, probability: number, confidence: number) => ({
    match_id: matchId,
    market: "1X2",
    line: null,
    selection,
    probability,
    push_probability: null,
    confidence_score: confidence,
    explanation: {},
    features_hash: HASH,
    as_of: iso(-2 * HOUR),
  });
  await tx.query("select public.record_predictions($1, $2)", [
    predRun,
    JSON.stringify({
      predictions: [
        p(m1, "HOME", 0.5, 0.6),
        p(m1, "DRAW", 0.25, 0.6),
        p(m1, "AWAY", 0.25, 0.6),
        p(m2, "HOME", 0.55, 0.5),
        p(m2, "DRAW", 0.25, 0.5),
        p(m2, "AWAY", 0.2, 0.5),
        p(m3, "HOME", 0.6, 0.5),
        p(m3, "DRAW", 0.25, 0.5),
        p(m3, "AWAY", 0.15, 0.5),
      ],
    }),
  ]);
  await tx.query("select public.finish_prediction_run($1, 'SUCCEEDED', 2)", [predRun]);

  const pred: Record<string, number> = {};
  for (const r of (
    await tx.query<{ k: string; id: number }>(
      `select ${label("p.match_id")} || ':' || p.selection k, p.id from public.predictions p`,
      [m1, m2, m3],
    )
  ).rows)
    pred[r.k] = Number(r.id);
  const odds: Record<string, number> = {};
  for (const r of (
    await tx.query<{ k: string; id: number }>(
      `select ${label("e.match_id")} || ':' || s.selection k, s.id
       from public.odds_snapshots s
       join public.odds_events e on e.id = s.event_id
       where e.match_id is not null`,
      [m1, m2, m3],
    )
  ).rows)
    odds[r.k] = Number(r.id);
  return { model, m1, m2, m3, pred, odds };
}

const leg = (s: Seed, key: string) => ({
  prediction_id: s.pred[key],
  odds_snapshot_id: s.odds[key],
});

/** Regole precedenti all'ADR 0028 (solo modello, tutti i bookmaker): base dei test storici. */
const LEGACY_RULES = {
  ...DEFAULT_BET_BUILDER_RULES,
  rules_version: "2026.11.08-1",
  market_weight: 0,
  italian_bookmakers_only: false,
};

const startRun = (tx: Tx, model: number, rules: unknown = LEGACY_RULES) =>
  num(tx, "select public.start_bet_builder_run($1, $2, $3, 'manual') v", [
    model,
    COMMIT,
    JSON.stringify(rules),
  ]);

const record = (tx: Tx, run: number, proposals: unknown[]) =>
  tx.query<{ r: { proposals: number; skipped: number } }>(
    "select public.record_bet_proposals($1, $2) r",
    [run, JSON.stringify({ proposals })],
  );

/** Una singola (M1 casa) e una multipla (M1 casa + M2 casa), run chiusa con successo. */
async function seedProposals(tx: Tx) {
  const s = await seed(tx);
  const run = await startRun(tx, s.model);
  const r = await record(tx, run, [
    {
      category: "CONSERVATIVE",
      rank: 1,
      rank_score: 0.12,
      legs: [leg(s, "M1:HOME")],
      explanation: { nota: "DEMO" },
    },
    {
      category: "BALANCED",
      rank: 1,
      rank_score: 0.2,
      legs: [leg(s, "M1:HOME"), leg(s, "M2:HOME")],
    },
  ]);
  await tx.query("select public.finish_bet_builder_run($1, 'SUCCEEDED', 10)", [run]);
  return { s, run, written: r.rows[0]!.r };
}

describe("contratto Bet Builder", () => {
  it("enum coerenti con i tipi condivisi", async () => {
    const values = async (t: string) =>
      (
        await db.query<{ v: string }>(
          `select e.enumlabel v from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = $1 order by e.enumsortorder`,
          [t],
        )
      ).rows.map((r) => r.v);
    expect(await values("bet_proposal_kind")).toEqual([...BET_PROPOSAL_KINDS]);
    expect(await values("bet_proposal_category")).toEqual([...BET_PROPOSAL_CATEGORIES]);
  });

  it("anon non legge nulla", async () => {
    await asServiceRole(db, seedProposals);
    await asAnon(db, async (tx) => {
      for (const rel of [
        "public.bet_builder_runs",
        "public.bet_proposals",
        "public.bet_proposal_legs",
        "public.v_active_bet_proposals",
        "public.v_bet_proposal_legs",
        "public.v_bet_builder_latest_run",
        "public.user_bet_slips",
        "public.user_bet_slip_selections",
      ]) {
        expect(await attempt(tx, `select * from ${rel}`)).toMatch(/permission denied/);
      }
    });
  });

  it("gli utenti, anche Super Admin, non scrivono proposte né chiamano le funzioni del motore", async () => {
    const { s, run } = await asServiceRole(db, seedProposals);
    for (const user of [alice, superAdmin]) {
      await asUser(db, user, async (tx) => {
        expect(
          await attempt(
            tx,
            `insert into public.bet_proposals (run_id, model_version_id, kind, category, slate_date,
               rank, rank_score, legs_count, probability, combined_price, expected_value,
               confidence_score, first_kickoff_at, last_kickoff_at, odds_observed_at)
             values ($1, $2, 'SINGLE', 'AGGRESSIVE', current_date, 9, 0, 1, 0.5, 2, 0, 0.5,
               now(), now(), now())`,
            [run, s.model],
          ),
        ).toMatch(/permission denied/);
        expect(await attempt(tx, "update public.bet_proposals set rank = 2")).toMatch(
          /permission denied/,
        );
        expect(
          await attempt(tx, "select public.record_bet_proposals($1, '{}'::jsonb)", [run]),
        ).toMatch(/permission denied/);
        expect(
          await attempt(tx, "select public.start_bet_builder_run($1, $2, '{}'::jsonb)", [
            s.model,
            COMMIT,
          ]),
        ).toMatch(/permission denied/);
      });
    }
  });
});

describe("proposte", () => {
  it("il database calcola probabilità, quota combinata, EV e Confidence Score", async () => {
    const { written } = await asServiceRole(db, seedProposals);
    expect(written).toEqual({ proposals: 2, skipped: 0 });
    await asUser(db, alice, async (tx) => {
      const rows = (
        await tx.query<{
          category: string;
          kind: string;
          legs_count: number;
          probability: string;
          combined_price: string;
          expected_value: string;
          confidence_score: string;
          legs_stale: number;
          legs_price_changed: number;
        }>(
          `select category, kind, legs_count, probability::text, combined_price::text,
                  expected_value::text, confidence_score::text, legs_stale, legs_price_changed
           from public.v_active_bet_proposals order by category`,
        )
      ).rows;
      expect(rows).toEqual([
        {
          category: "CONSERVATIVE",
          kind: "SINGLE",
          legs_count: 1,
          probability: "0.50000000",
          combined_price: "2.500000",
          expected_value: "0.250000",
          confidence_score: "0.6000",
          legs_stale: 0,
          legs_price_changed: 0,
        },
        {
          // 0,50 · 0,55 = 0,275; 2,50 · 2,20 = 5,50; EV = 0,5125; Confidence = min(0,6; 0,5)
          category: "BALANCED",
          kind: "MULTIPLE",
          legs_count: 2,
          probability: "0.27500000",
          combined_price: "5.500000",
          expected_value: "0.512500",
          confidence_score: "0.5000",
          legs_stale: 0,
          legs_price_changed: 0,
        },
      ]);
      const legs = (
        await tx.query<{ leg_no: number; selection: string; price: string; f: string }>(
          `select l.leg_no, l.selection, l.price::text, l.current_freshness::text f
           from public.v_bet_proposal_legs l
           join public.v_active_bet_proposals p on p.proposal_id = l.proposal_id
           where p.category = 'BALANCED' order by l.leg_no`,
        )
      ).rows;
      expect(legs).toEqual([
        { leg_no: 1, selection: "HOME", price: "2.500", f: "FRESH" },
        { leg_no: 2, selection: "HOME", price: "2.200", f: "FRESH" },
      ]);
    });
  });

  it("ADR 0028: probabilità usata = media pesata modello/mercato, solo bookmaker italiani", async () => {
    await asServiceRole(db, async (tx) => {
      const s = await seed(tx);
      const rules = {
        ...DEFAULT_BET_BUILDER_RULES,
        rules_version: "DEMO-0028",
        market_weight: 0.5,
        italian_bookmakers_only: true,
      };
      const run = await startRun(tx, s.model, rules);
      // Senza la probabilità di mercato la selezione è rifiutata.
      expect(
        await attempt(tx, "select public.record_bet_proposals($1, $2)", [
          run,
          JSON.stringify({
            proposals: [
              { category: "CONSERVATIVE", rank: 1, rank_score: 0.1, legs: [leg(s, "M1:HOME")] },
            ],
          }),
        ]),
      ).toMatch(/mercato mancante/);
      // Modello 0,50, mercato 0,40 → usata 0,45; EV = 0,45 · 2,50 − 1 = 0,125.
      await record(tx, run, [
        {
          category: "CONSERVATIVE",
          rank: 1,
          rank_score: 0.1,
          legs: [{ ...leg(s, "M1:HOME"), market_probability: 0.4 }],
        },
      ]);
      const p = await one<{ probability: string; ev: string }>(
        tx,
        "select probability::text, expected_value::text ev from public.bet_proposals where run_id = $1",
        [run],
      );
      expect(p).toEqual({ probability: "0.45000000", ev: "0.125000" });
      const l = await one<{ probability: string; model: string; market: string }>(
        tx,
        `select l.probability::text, l.model_probability::text model, l.market_probability::text market
         from public.bet_proposal_legs l join public.bet_proposals p on p.id = l.proposal_id
         where p.run_id = $1`,
        [run],
      );
      expect(l).toEqual({ probability: "0.45000000", model: "0.50000000", market: "0.40000000" });
      // Una quota di un bookmaker non italiano è rifiutata.
      await tx.query("update public.bookmakers set italian_market = false where code = 'demo_it'");
      expect(
        await attempt(tx, "select public.record_bet_proposals($1, $2)", [
          run,
          JSON.stringify({
            proposals: [
              {
                category: "BALANCED",
                rank: 1,
                rank_score: 0.1,
                legs: [{ ...leg(s, "M2:HOME"), market_probability: 0.5 }],
              },
            ],
          }),
        ]),
      ).toMatch(/bookmaker italiano/);
    });
  });

  it("ADR 0033: proposte anche su under/over e doppia chance con quote italiane", async () => {
    await asServiceRole(db, async (tx) => {
      const s = await seed(tx);
      // Quote italiane di under/over 2,5 e doppia chance sulla partita M2 (evento E2).
      const oddsRun = await num(
        tx,
        "select public.start_ingestion_run($1, 'odds.h2h', 'DEMO:extra', 'manual') v",
        [ODDS],
      );
      const market = (key: string, outcomes: [string, number][]) => ({
        key,
        last_update: iso(-HOUR - 5 * 60_000),
        outcomes: outcomes.map(([selection, price]) => ({ selection, price })),
      });
      await tx.query("select public.ingest_odds_batch($1, $2)", [
        oddsRun,
        JSON.stringify({
          observed_at: iso(-HOUR),
          competition_code: "DEMO",
          sport_key: "soccer_demo",
          events: [
            {
              provider_event_id: "E2",
              commence_time: iso(50 * HOUR),
              home_team: "DEMO Squadra T3",
              away_team: "DEMO Squadra T4",
              bookmakers: [
                {
                  key: "demo_it",
                  title: "DEMO (IT)",
                  region: "eu",
                  markets: [
                    market("totals_2_5", [
                      ["OVER", 2.2],
                      ["UNDER", 1.7],
                    ]),
                    market("double_chance", [
                      ["HOME_DRAW", 1.5],
                      ["HOME_AWAY", 1.3],
                      ["DRAW_AWAY", 1.8],
                    ]),
                  ],
                },
              ],
            },
          ],
        }),
      ]);
      await tx.query("select public.finish_ingestion_run($1, 'SUCCEEDED')", [oddsRun]);
      const predRun = await num(tx, "select public.start_prediction_run($1, $2, 'manual') v", [
        s.model,
        COMMIT,
      ]);
      const pred = (
        market: string,
        line: number | null,
        selection: string,
        probability: number,
      ) => ({
        match_id: s.m2,
        market,
        line,
        selection,
        probability,
        push_probability: null,
        confidence_score: 0.6,
        explanation: {},
        features_hash: HASH,
        as_of: iso(-HOUR),
      });
      await tx.query("select public.record_predictions($1, $2)", [
        predRun,
        JSON.stringify({
          predictions: [
            pred("TOTAL_GOALS", 2.5, "OVER", 0.55),
            pred("TOTAL_GOALS", 2.5, "UNDER", 0.45),
            pred("DOUBLE_CHANCE", null, "HOME_DRAW", 0.8),
          ],
        }),
      ]);
      await tx.query("select public.finish_prediction_run($1, 'SUCCEEDED', 1)", [predRun]);
      const ids = async (market: string, selection: string) => ({
        prediction_id: await num(
          tx,
          "select id v from public.predictions where match_id = $1 and market = $2 and selection = $3",
          [s.m2, market, selection],
        ),
        odds_snapshot_id: await num(
          tx,
          `select s.id v from public.odds_snapshots s join public.odds_events e on e.id = s.event_id
           where e.match_id = $1 and s.market = $2 and s.selection = $3`,
          [s.m2, market === "TOTAL_GOALS" ? "totals_2_5" : "double_chance", selection],
        ),
      });
      const rules = { ...DEFAULT_BET_BUILDER_RULES, rules_version: "DEMO-0033" };
      const run = await startRun(tx, s.model, rules);
      // Over 2,5: modello 0,55, mercato 0,50 → usata 0,525; EV = 0,525 · 2,2 − 1 = 0,155.
      await record(tx, run, [
        {
          category: "BALANCED",
          rank: 1,
          rank_score: 0.1,
          legs: [{ ...(await ids("TOTAL_GOALS", "OVER")), market_probability: 0.5 }],
        },
        {
          category: "CONSERVATIVE",
          rank: 1,
          rank_score: 0.1,
          legs: [{ ...(await ids("DOUBLE_CHANCE", "HOME_DRAW")), market_probability: 0.7 }],
        },
      ]);
      const rows = (
        await tx.query<{ market: string; line: string | null; probability: string; ev: string }>(
          `select l.market, l.line::text, p.probability::text, p.expected_value::text ev
           from public.bet_proposals p join public.bet_proposal_legs l on l.proposal_id = p.id
           where p.run_id = $1 order by l.market`,
          [run],
        )
      ).rows;
      expect(rows).toEqual([
        // Doppia chance: 0,5·0,8 + 0,5·0,7 = 0,75; EV = 0,75 · 1,5 − 1 = 0,125.
        { market: "DOUBLE_CHANCE", line: null, probability: "0.75000000", ev: "0.125000" },
        { market: "TOTAL_GOALS", line: "2.50", probability: "0.52500000", ev: "0.155000" },
      ]);
    });
  });

  it("rieseguire lo stesso lotto non duplica nulla", async () => {
    await asServiceRole(db, async (tx) => {
      const s = await seed(tx);
      const run = await startRun(tx, s.model);
      const batch = [
        { category: "CONSERVATIVE", rank: 1, rank_score: 0.1, legs: [leg(s, "M1:HOME")] },
      ];
      expect((await record(tx, run, batch)).rows[0]!.r).toEqual({ proposals: 1, skipped: 0 });
      expect((await record(tx, run, batch)).rows[0]!.r).toEqual({ proposals: 0, skipped: 1 });
      expect(await num(tx, "select count(*)::int v from public.bet_proposal_legs")).toBe(1);
    });
  });

  it("proposte e selezioni sono immutabili", async () => {
    await asServiceRole(db, async (tx) => {
      await seedProposals(tx);
      expect(await attempt(tx, "update public.bet_proposals set expected_value = 1")).toMatch(
        /immutabile/,
      );
      expect(await attempt(tx, "delete from public.bet_proposals")).toMatch(/immutabile/);
      expect(await attempt(tx, "update public.bet_proposal_legs set price = 9")).toMatch(
        /immutabile/,
      );
      expect(await attempt(tx, "delete from public.bet_proposal_legs")).toMatch(/immutabile/);
    });
    const truncate = await db.transaction((tx) =>
      attempt(tx as unknown as Tx, "truncate public.bet_proposal_legs"),
    );
    expect(truncate).toMatch(/immutabile/);
  });

  it("le regole della run sono verificate: soglie, stessa partita, posizione, selezioni", async () => {
    await asServiceRole(db, async (tx) => {
      const s = await seed(tx);
      const run = await startRun(tx, s.model);
      const bad = (proposal: Record<string, unknown>) =>
        attempt(tx, "select public.record_bet_proposals($1, $2)", [
          run,
          JSON.stringify({
            proposals: [{ category: "AGGRESSIVE", rank: 1, rank_score: 0, ...proposal }],
          }),
        ]);
      // Pareggio M1: 0,25 · 3,40 − 1 = −0,15 → EV negativo.
      expect(await bad({ legs: [leg(s, "M1:DRAW")] })).toMatch(/sotto le soglie/);
      // Due esiti della stessa partita.
      expect(await bad({ legs: [leg(s, "M1:HOME"), leg(s, "M1:AWAY")] })).toMatch(/stessa partita/);
      // Quota di un esito diverso da quello della previsione.
      expect(
        await bad({
          legs: [{ prediction_id: s.pred["M1:HOME"], odds_snapshot_id: s.odds["M1:AWAY"] }],
        }),
      ).toMatch(/diversi dalla previsione/);
      // Quota di un'altra partita.
      expect(
        await bad({
          legs: [{ prediction_id: s.pred["M1:HOME"], odds_snapshot_id: s.odds["M2:HOME"] }],
        }),
      ).toMatch(/stessa partita/);
      // M1 e M3 hanno una squadra in comune: niente indipendenza.
      expect(await bad({ legs: [leg(s, "M1:HOME"), leg(s, "M3:HOME")] })).toMatch(
        /squadra già presente/,
      );
      expect(await bad({ rank: 99, legs: [leg(s, "M1:HOME")] })).toMatch(/Posizione/);
      expect(await bad({ legs: [1, 2, 3, 4, 5].map(() => leg(s, "M1:HOME")) })).toMatch(
        /Numero di selezioni/,
      );
      expect(await bad({ legs: [] })).toMatch(/Numero di selezioni/);
      expect(await bad({ category: "SAFE", legs: [leg(s, "M1:HOME")] })).not.toBeNull();
      expect(await num(tx, "select count(*)::int v from public.bet_proposals")).toBe(0);
    });
  });

  it("solo quote FRESH: una quota letta più di 26 ore fa è rifiutata (ADR 0071)", async () => {
    await asServiceRole(db, async (tx) => {
      const s = await seed(tx, -27 * HOUR);
      const run = await startRun(tx, s.model);
      expect(
        await attempt(tx, "select public.record_bet_proposals($1, $2)", [
          run,
          JSON.stringify({
            proposals: [
              { category: "CONSERVATIVE", rank: 1, rank_score: 0, legs: [leg(s, "M1:HOME")] },
            ],
          }),
        ]),
      ).toMatch(/STALE/);
    });
  });

  it("la run richiede il modello attivo e regole complete", async () => {
    await asServiceRole(db, async (tx) => {
      const s = await seed(tx);
      expect(
        await attempt(tx, "select public.start_bet_builder_run($1, $2, $3)", [
          s.model,
          COMMIT,
          JSON.stringify({ ...DEFAULT_BET_BUILDER_RULES, min_expected_value: 0 }),
        ]),
      ).toMatch(/min_expected_value/);
      const incomplete: Record<string, unknown> = { ...DEFAULT_BET_BUILDER_RULES };
      delete incomplete.max_legs;
      expect(
        await attempt(tx, "select public.start_bet_builder_run($1, $2, $3)", [
          s.model,
          COMMIT,
          JSON.stringify(incomplete),
        ]),
      ).toMatch(/max_legs/);
      await tx.query("update public.model_versions set status = 'RETIRED', retired_at = now()");
      expect(
        await attempt(tx, "select public.start_bet_builder_run($1, $2, $3)", [
          s.model,
          COMMIT,
          JSON.stringify(DEFAULT_BET_BUILDER_RULES),
        ]),
      ).toMatch(/modello attivo/);
    });
  });

  it("nessuna schedina forzata: una run senza proposte azzera le proposte attive", async () => {
    await asServiceRole(db, async (tx) => {
      const { s } = await seedProposals(tx);
      expect(await num(tx, "select count(*)::int v from public.v_active_bet_proposals")).toBe(2);
      const empty = await startRun(tx, s.model);
      await tx.query("select public.finish_bet_builder_run($1, 'SUCCEEDED', 10)", [empty]);
    });
    await asUser(db, alice, async (tx) => {
      expect(await num(tx, "select count(*)::int v from public.v_active_bet_proposals")).toBe(0);
      const latest = await one<{ proposals_written: number; candidates_evaluated: number }>(
        tx,
        "select proposals_written, candidates_evaluated from public.v_bet_builder_latest_run",
      );
      expect(latest).toEqual({ proposals_written: 0, candidates_evaluated: 10 });
      // Le proposte precedenti restano consultabili come storico.
      expect(await num(tx, "select count(*)::int v from public.bet_proposals")).toBe(2);
    });
  });
});

describe("schedine degli utenti", () => {
  async function aliceSlip(): Promise<{ slip: number; s: Seed }> {
    const { s } = await asServiceRole(db, seedProposals);
    const slip = await asUser(db, alice, async (tx) => {
      const id = await num(
        tx,
        "insert into public.user_bet_slips (name) values ('DEMO la mia multipla') returning id v",
      );
      await tx.query(
        `insert into public.user_bet_slip_selections
           (slip_id, leg_no, match_id, market, selection, prediction_id, odds_snapshot_id)
         values ($1, 1, $2, '1X2', 'HOME', $3, $4)`,
        [id, s.m1, s.pred["M1:HOME"], s.odds["M1:HOME"]],
      );
      return id;
    });
    return { slip, s };
  }

  it("il proprietario legge, modifica e cancella le proprie schedine", async () => {
    const { slip } = await aliceSlip();
    await asUser(db, alice, async (tx) => {
      expect(await num(tx, "select count(*)::int v from public.user_bet_slip_selections")).toBe(1);
      await tx.query("update public.user_bet_slips set notes = 'DEMO' where id = $1", [slip]);
      await tx.query("delete from public.user_bet_slips where id = $1", [slip]);
      expect(await num(tx, "select count(*)::int v from public.user_bet_slips")).toBe(0);
      expect(await num(tx, "select count(*)::int v from public.user_bet_slip_selections")).toBe(0);
    });
  });

  it("isolamento tra utenti, anche verso Admin e Super Admin", async () => {
    const { slip, s } = await aliceSlip();
    for (const user of [bob, admin, superAdmin]) {
      await asUser(db, user, async (tx) => {
        expect(await num(tx, "select count(*)::int v from public.user_bet_slips")).toBe(0);
        expect(await num(tx, "select count(*)::int v from public.user_bet_slip_selections")).toBe(
          0,
        );
        const upd = await tx.query("update public.user_bet_slips set name = 'x' where id = $1", [
          slip,
        ]);
        expect(upd.affectedRows).toBe(0);
        const del = await tx.query("delete from public.user_bet_slips where id = $1", [slip]);
        expect(del.affectedRows).toBe(0);
        // Né una selezione nella schedina di Alice, né una schedina a nome di Alice.
        expect(
          await attempt(
            tx,
            `insert into public.user_bet_slip_selections (slip_id, leg_no, match_id, market, selection)
             values ($1, 2, $2, '1X2', 'DRAW')`,
            [slip, s.m1],
          ),
        ).not.toBeNull();
        expect(
          await attempt(tx, "insert into public.user_bet_slips (user_id, name) values ($1, 'x')", [
            alice.id,
          ]),
        ).toMatch(/row-level security/);
      });
    }
    // Nemmeno la chiave secret (service_role) ha privilegi sulle schedine.
    await asServiceRole(db, async (tx) => {
      expect(await attempt(tx, "select * from public.user_bet_slips")).toMatch(/permission denied/);
    });
    expect(await num(db, "select count(*)::int v from public.user_bet_slip_selections")).toBe(1);
  });

  it("un account sospeso non vede più le proprie schedine", async () => {
    await aliceSlip();
    await db.query(
      "update public.profiles set status = 'SUSPENDED', suspended_at = now() where id = $1",
      [alice.id],
    );
    await asUser(db, alice, async (tx) => {
      expect(await num(tx, "select count(*)::int v from public.user_bet_slips")).toBe(0);
    });
  });

  it("i riferimenti a previsione e quota devono corrispondere alla selezione", async () => {
    const { slip, s } = await aliceSlip();
    await asUser(db, alice, async (tx) => {
      const insert = (selection: string, prediction: number | null, snapshot: number | null) =>
        attempt(
          tx,
          `insert into public.user_bet_slip_selections
             (slip_id, leg_no, match_id, market, selection, prediction_id, odds_snapshot_id)
           values ($1, 2, $2, '1X2', $3, $4, $5)`,
          [slip, s.m2, selection, prediction, snapshot],
        );
      expect(await insert("HOME", s.pred["M1:HOME"]!, null)).toMatch(/previsione/);
      expect(await insert("HOME", null, s.odds["M2:AWAY"]!)).toMatch(/quota/);
      expect(await insert("HOME", s.pred["M2:HOME"]!, s.odds["M2:HOME"]!)).toBeNull();
    });
  });
});

describe("schedine consigliate salvate (ADR 0070)", () => {
  it("le leggono gli utenti attivi; le scrive solo il servizio", async () => {
    await asServiceRole(db, (tx) =>
      tx.query(
        `insert into public.recommended_slips (window_kind, window_start, profile, signature, picks,
           price, probability, expected_value, first_kickoff_at)
         values ('day', '2026-11-24', 'DOUBLE', '1|DOUBLE_CHANCE||HOME_DRAW', '[{"matchId":1}]',
           1.44, 0.7, 0.008, '2026-11-24T20:00:00Z')`,
      ),
    );
    await asUser(db, alice, async (tx) => {
      const { rows } = await tx.query("select profile from public.recommended_slips");
      expect(rows).toEqual([{ profile: "DOUBLE" }]);
      expect(
        await attempt(
          tx,
          `insert into public.recommended_slips (window_kind, window_start, profile, signature, picks,
             price, probability, expected_value, first_kickoff_at)
           values ('day', '2026-11-25', 'DOUBLE', 'x', '[{}]', 2, 0.5, 0, now())`,
        ),
      ).toMatch(/permission denied/);
    });
  });
});
