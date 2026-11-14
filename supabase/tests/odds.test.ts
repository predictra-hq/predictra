/**
 * Test del contratto M3 (quote, margine, statistiche). Dati fittizi etichettati
 * DEMO: verificano lo schema e non arrivano mai su DEV.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { ODDS_MARKETS } from "@predictra/shared-types";
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

let db: PGlite;
let alice: TestUser;
let superAdmin: TestUser;

const one = async <T>(tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0] as T;

beforeEach(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  superAdmin = await createAuthUser(db, "super@example.test");
  await grantRole(db, alice.id, "USER");
  await grantRole(db, superAdmin.id, "SUPER_ADMIN");
});

/** Competizione DEMO con due squadre e una partita, scritte con la funzione di M2. */
async function seedFootball(tx: Tx, kickoff = "2026-11-08T19:45:00Z") {
  const run = Number(
    (
      await one<{ id: number }>(
        tx,
        "select public.start_ingestion_run($1, 'fd.competition', 'DEMO', 'manual') id",
        [FD],
      )
    ).id,
  );
  const batch = {
    observed_at: "2026-11-07T10:00:00Z",
    competition: { provider_id: "C1", name: "DEMO Lega", code: "DEMO", type: "LEAGUE" },
    season: {
      provider_id: "S1",
      label: "2026/27",
      start_date: "2026-08-01",
      end_date: "2027-06-30",
    },
    teams: [
      { provider_id: "T1", name: "DEMO Casa FC", short_name: "DEMO Casa" },
      { provider_id: "T2", name: "DEMO Ospite FC", short_name: "DEMO Ospite" },
    ],
    matches: [
      {
        provider_id: "M1",
        matchday: 10,
        kickoff_at: kickoff,
        status: "SCHEDULED",
        home_team_provider_id: "T1",
        away_team_provider_id: "T2",
        event_time: "2026-11-07T09:00:00Z",
      },
      {
        provider_id: "M0",
        matchday: 1,
        kickoff_at: "2026-08-20T18:00:00Z",
        status: "FINISHED",
        home_team_provider_id: "T1",
        away_team_provider_id: "T2",
        home_score: 2,
        away_score: 1,
        event_time: "2026-08-20T20:00:00Z",
      },
      {
        provider_id: "M2",
        matchday: 2,
        kickoff_at: "2026-08-27T18:00:00Z",
        status: "FINISHED",
        home_team_provider_id: "T2",
        away_team_provider_id: "T1",
        home_score: 1,
        away_score: 1,
        event_time: "2026-08-27T20:00:00Z",
      },
    ],
  };
  await tx.query("select public.ingest_football_batch($1, $2)", [run, JSON.stringify(batch)]);
  await tx.query("select public.finish_ingestion_run($1, 'SUCCEEDED')", [run]);
}

const oddsBatch = (
  home: string,
  prices: [number, number, number] = [2, 3.4, 4],
  lastUpdate = "2026-01-07T11:00:00Z",
  observed = "2026-01-07T11:05:00Z",
) => ({
  observed_at: observed,
  competition_code: "DEMO",
  sport_key: "soccer_demo",
  events: [
    {
      provider_event_id: "E1",
      commence_time: "2026-11-08T19:45:00Z",
      home_team: home,
      away_team: "DEMO Ospite",
      bookmakers: [
        {
          key: "demo_it",
          title: "DEMO (IT)",
          region: "eu",
          markets: [
            {
              key: "h2h",
              last_update: lastUpdate,
              outcomes: [
                { selection: "HOME", price: prices[0] },
                { selection: "DRAW", price: prices[1] },
                { selection: "AWAY", price: prices[2] },
              ],
            },
          ],
        },
        {
          key: "demo_ref",
          title: "DEMO Riferimento",
          region: "eu",
          markets: [
            {
              key: "h2h",
              last_update: lastUpdate,
              outcomes: [
                { selection: "HOME", price: 2.1 },
                { selection: "DRAW", price: 3.3 },
                { selection: "AWAY", price: 3.8 },
              ],
            },
          ],
        },
      ],
    },
  ],
});

async function ingestOdds(tx: Tx, batch: unknown) {
  const run = Number(
    (
      await one<{ id: number }>(
        tx,
        "select public.start_ingestion_run($1, 'odds.h2h', $2, 'manual') id",
        [ODDS, `DEMO:${Math.random()}`],
      )
    ).id,
  );
  const r = await one<{ r: Record<string, number> }>(
    tx,
    "select public.ingest_odds_batch($1, $2) r",
    [run, JSON.stringify(batch)],
  );
  await tx.query("select public.finish_ingestion_run($1, 'SUCCEEDED')", [run]);
  return r.r;
}

describe("contratto quote", () => {
  it("catalogo: The Odds API verificato, mercato 1X2 coerente con i tipi condivisi", async () => {
    const p = await one<{ verified: boolean; kind: string }>(
      db,
      "select terms_verified_at is not null verified, primary_data_kind kind from public.providers where code = $1",
      [ODDS],
    );
    expect(p).toEqual({ verified: true, kind: "odds" });
    const m = await one<{ selections: string[] }>(
      db,
      "select selections from public.markets where code = 'h2h'",
    );
    expect(m.selections).toEqual([...ODDS_MARKETS.h2h]);
    const { n } = await one<{ n: number }>(db, "select count(*)::int n from public.odds_snapshots");
    expect(n).toBe(0);
  });

  it("anon non legge le quote; gli utenti non le scrivono", async () => {
    await asAnon(db, async (tx) => {
      expect(await attempt(tx, "select * from public.v_match_odds_h2h")).toMatch(
        /permission denied/,
      );
    });
    await asUser(db, superAdmin, async (tx) => {
      expect(
        await attempt(
          tx,
          "insert into public.markets (code, name, selections) values ('x_y', 'x', array['A','B'])",
        ),
      ).toMatch(/permission denied/);
      expect(await attempt(tx, "select public.ingest_odds_batch(1, '{}'::jsonb)")).toMatch(
        /permission denied/,
      );
    });
  });
});

describe("scrittura e abbinamento", () => {
  it("un evento con nomi noti si abbina alla partita; rileggere non duplica", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx);
      const r1 = await ingestOdds(tx, oddsBatch("DEMO Casa"));
      expect(r1).toMatchObject({ events: 1, matched: 1, snapshots_inserted: 6, skipped: 0 });
      const r2 = await ingestOdds(
        tx,
        oddsBatch("DEMO Casa", [2, 3.4, 4], "2026-01-07T11:00:00Z", "2026-01-07T13:00:00Z"),
      );
      expect(r2).toMatchObject({ snapshots_inserted: 0, snapshots_confirmed: 6 });
      const { n } = await one<{ n: number }>(
        tx,
        "select count(*)::int n from public.odds_snapshots",
      );
      expect(n).toBe(6);
      const b = await one<{ italian: boolean }>(
        tx,
        "select italian_market italian from public.bookmakers where code = 'demo_it'",
      );
      expect(b.italian).toBe(true);
    });
  });

  it("ADR 0029: quote under/over salvate per linea e collegate alle previsioni TOTAL_GOALS", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx);
      const batch = oddsBatch("DEMO Casa");
      batch.events[0]!.bookmakers[0]!.markets.push({
        key: "totals_2_5",
        last_update: "2026-01-07T11:00:00Z",
        outcomes: [
          { selection: "OVER", price: 1.9 },
          { selection: "UNDER", price: 1.95 },
        ],
      } as never);
      batch.events[0]!.bookmakers[0]!.markets.push({
        key: "totals_2_25", // linea non in catalogo: scartata
        last_update: "2026-01-07T11:00:00Z",
        outcomes: [{ selection: "OVER", price: 1.8 }],
      } as never);
      await ingestOdds(tx, batch);
      const rows = (
        await tx.query<{ market: string; selection: string; price: string }>(
          `select market, selection, price::text from public.odds_snapshots
           where market like 'totals%' order by selection`,
        )
      ).rows;
      expect(rows).toEqual([
        { market: "totals_2_5", selection: "OVER", price: "1.900" },
        { market: "totals_2_5", selection: "UNDER", price: "1.950" },
      ]);
      const m = await one<{ a: string | null; b: string | null; c: string | null }>(
        tx,
        `select app_private.odds_market_for('TOTAL_GOALS', 2.5) a,
                app_private.odds_market_for('TOTAL_GOALS', 2) b,
                app_private.odds_market_for('1X2', null) c`,
      );
      expect(m).toEqual({ a: "totals_2_5", b: null, c: "h2h" });
      // ADR 0032: doppia chance per partita.
      const dc = await one<{ code: string | null; sel: string[] }>(
        tx,
        `select app_private.odds_market_for('DOUBLE_CHANCE', null) code,
                (select selections from public.markets where code = 'double_chance') sel`,
      );
      expect(dc).toEqual({ code: "double_chance", sel: ["HOME_DRAW", "HOME_AWAY", "DRAW_AWAY"] });
    });
  });

  it("una quota aggiornata dal bookmaker diventa una riga nuova", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx);
      await ingestOdds(tx, oddsBatch("DEMO Casa"));
      const r = await ingestOdds(
        tx,
        oddsBatch("DEMO Casa", [1.9, 3.5, 4.2], "2026-01-07T15:00:00Z", "2026-01-07T15:05:00Z"),
      );
      expect(r.snapshots_inserted).toBe(6);
      const { price } = await one<{ price: string }>(
        tx,
        "select price::text from public.v_latest_odds where bookmaker = 'demo_it' and selection = 'HOME'",
      );
      expect(price).toBe("1.900");
    });
  });

  it("un evento non abbinato apre un problema, chiuso quando l'alias viene aggiunto", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx);
      const r1 = await ingestOdds(tx, oddsBatch("DEMO Casa Nome Diverso"));
      expect(r1.matched).toBe(0);
      const open = await one<{ n: number; home: string }>(
        tx,
        `select count(*)::int n, min(details ->> 'home_team') home from public.data_quality_issues
         where status = 'OPEN' and check_code = 'odds.event_unmatched'`,
      );
      expect(open).toEqual({ n: 1, home: "DEMO Casa Nome Diverso" });
    });

    const teamId = Number(
      (await one<{ id: number }>(db, "select id from public.teams where name = 'DEMO Casa FC'")).id,
    );
    await asUser(db, alice, async (tx) => {
      expect(
        await attempt(tx, "select public.add_team_alias($1, 'DEMO Casa Nome Diverso')", [teamId]),
      ).toMatch(/insufficienti|Super Admin/i);
    });
    await asUser(db, superAdmin, async (tx) => {
      await tx.query("select public.add_team_alias($1, 'DEMO Casa Nome Diverso')", [teamId]);
    });
    await asServiceRole(db, async (tx) => {
      const r2 = await ingestOdds(tx, oddsBatch("DEMO Casa Nome Diverso"));
      expect(r2.matched).toBe(1);
      const { n } = await one<{ n: number }>(
        tx,
        "select count(*)::int n from public.data_quality_issues where status = 'OPEN'",
      );
      expect(n).toBe(0);
      const { a } = await one<{ a: number }>(
        tx,
        "select count(*)::int a from public.audit_logs where action = 'team_alias.added'",
      );
      expect(a).toBe(1);
    });
  });

  it("l'alias ricollega subito anche un evento già giocato e chiude il suo avviso", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx);
      const r1 = await ingestOdds(tx, oddsBatch("DEMO Casa Nome Diverso"));
      expect(r1.matched).toBe(0);
    });
    const teamId = Number(
      (await one<{ id: number }>(db, "select id from public.teams where name = 'DEMO Casa FC'")).id,
    );
    // Nessuna nuova raccolta: il provider non restituisce più l'evento.
    await asUser(db, superAdmin, async (tx) => {
      await tx.query("select public.add_team_alias($1, 'DEMO Casa Nome Diverso')", [teamId]);
    });
    const ev = await one<{ linked: number; open: number }>(
      db,
      `select (select count(*)::int from public.odds_events where match_id is not null) linked,
              (select count(*)::int from public.data_quality_issues
                where status = 'OPEN' and check_code = 'odds.event_unmatched') open`,
    );
    expect(ev).toEqual({ linked: 1, open: 0 });
  });

  it("evento passato con nomi noti ma partita rinviata: avviso chiuso come IGNORED a fine raccolta", async () => {
    await asServiceRole(db, async (tx) => {
      // La partita DEMO è stata spostata di due mesi: l'evento di quote dell'8/11 non ha
      // nessuna partita entro 36 ore, anche se i due nomi sono noti. La chiusura della
      // raccolta (finish_ingestion_run) rilancia il ricollegamento.
      await seedFootball(tx, "2027-01-04T20:15:00Z");
      const r1 = await ingestOdds(tx, oddsBatch("DEMO Casa"));
      expect(r1.matched).toBe(0);
      const after = await one<{ status: string; reason: string; linked: number }>(
        tx,
        `select i.status::text status, i.details ->> 'closed_reason' reason,
                (select count(*)::int from public.odds_events where match_id is not null) linked
         from public.data_quality_issues i where i.check_code = 'odds.event_unmatched'`,
      );
      expect(after).toEqual({
        status: "IGNORED",
        reason: "nomi noti, nessuna partita del calendario entro 36 ore",
        linked: 0,
      });
    });
  });

  it("evento futuro con nomi noti e partita non ancora in calendario: l'avviso resta aperto", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx, "2099-01-04T20:15:00Z");
      const batch = oddsBatch("DEMO Casa");
      batch.events[0]!.commence_time = "2099-03-01T19:45:00Z";
      await ingestOdds(tx, batch);
      const { n } = await one<{ n: number }>(
        tx,
        `select count(*)::int n from public.data_quality_issues
         where status = 'OPEN' and check_code = 'odds.event_unmatched'`,
      );
      expect(n).toBe(1);
    });
  });

  it("l'alias manuale richiede la 2FA", async () => {
    await asServiceRole(db, (tx) => seedFootball(tx));
    const teamId = Number(
      (await one<{ id: number }>(db, "select min(id) id from public.teams")).id,
    );
    await asUser(
      db,
      superAdmin,
      async (tx) => {
        expect(await attempt(tx, "select public.add_team_alias($1, 'X')", [teamId])).not.toBeNull();
      },
      "aal1",
    );
  });

  it("quote non valide o mercati sconosciuti vengono scartati", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx);
      const b = oddsBatch("DEMO Casa");
      const book = b.events[0]!.bookmakers[0]!;
      book.markets[0]!.outcomes[0]!.price = 1;
      book.markets.push({ key: "spreads", last_update: "2026-11-07T11:00:00Z", outcomes: [] });
      const r = await ingestOdds(tx, b);
      expect(r).toMatchObject({ snapshots_inserted: 5, skipped: 2 });
    });
  });
});

describe("viste", () => {
  it("v_match_odds_h2h calcola margine e probabilità come nell'esempio dell'ADR 0016", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx);
      await ingestOdds(tx, oddsBatch("DEMO Casa", [2, 3.4, 4]));
      const row = await one<Record<string, string>>(
        tx,
        `select overround::text, home_probability::text h, draw_probability::text d,
                away_probability::text a, freshness::text, match_id
         from public.v_match_odds_h2h where bookmaker = 'demo_it'`,
      );
      expect(row.overround).toBe("0.044118");
      expect(row.h).toBe("0.478873");
      expect(row.d).toBe("0.281690");
      expect(row.a).toBe("0.239437");
      expect(row.match_id).not.toBeNull();
      // Osservate a gennaio e lette "adesso": oltre le 12 ore sono STALE.
      expect(row.freshness).toBe("STALE");
    });
  });

  it("v_best_odds_h2h considera solo quote fresche", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx);
      await ingestOdds(tx, oddsBatch("DEMO Casa"));
      const { n } = await one<{ n: number }>(
        tx,
        "select count(*)::int n from public.v_best_odds_h2h",
      );
      expect(n).toBe(0);
      const now = new Date().toISOString();
      await ingestOdds(tx, oddsBatch("DEMO Casa", [2.2, 3.4, 4], now, now));
      const best = await one<{
        best_home_price: string;
        best_home_bookmaker: string;
        bookmakers: number;
      }>(
        tx,
        "select best_home_price::text, best_home_bookmaker, bookmakers from public.v_best_odds_h2h",
      );
      expect(best).toEqual({
        best_home_price: "2.200",
        best_home_bookmaker: "demo_it",
        bookmakers: 2,
      });
    });
  });

  it("statistiche di squadra, forma e lega dai risultati", async () => {
    await asServiceRole(db, async (tx) => {
      await seedFootball(tx);
      const home = await one<Record<string, number>>(
        tx,
        `select played, won, draw, lost, goals_for, goals_against, points, home_played, away_played,
                both_scored, over_2_5
         from public.v_team_season_stats where team_name = 'DEMO Casa FC'`,
      );
      expect(home).toEqual({
        played: 2,
        won: 1,
        draw: 1,
        lost: 0,
        goals_for: 3,
        goals_against: 2,
        points: 4,
        home_played: 1,
        away_played: 1,
        both_scored: 2,
        over_2_5: 1,
      });
      const form = await one<{ form: string }>(
        tx,
        `select f.form from public.v_team_form f join public.teams t on t.id = f.team_id
         where t.name = 'DEMO Casa FC'`,
      );
      expect(form.form).toBe("NV");
      const league = await one<Record<string, string>>(
        tx,
        "select matches::text, avg_goals::text, home_win_rate::text, draw_rate::text from public.v_league_season_stats",
      );
      expect(league).toEqual({
        matches: "2",
        avg_goals: "2.500",
        home_win_rate: "0.5000",
        draw_rate: "0.5000",
      });
    });
  });

  it("v_source_health usa la soglia delle quote per The Odds API", async () => {
    await asServiceRole(db, async (tx) => {
      await tx.query(
        `insert into public.ingestion_runs (provider, job_type, window_key, status, started_at, finished_at)
         values ($1, 'odds.h2h', 'DEMO', 'SUCCEEDED', now() - interval '13 hours', now() - interval '13 hours')`,
        [ODDS],
      );
      const h = await one<{ freshness: string; health: string }>(
        tx,
        "select freshness, health from public.v_source_health where provider = $1",
        [ODDS],
      );
      expect(h).toEqual({ freshness: "STALE", health: "DEGRADED" });
    });
  });
});
