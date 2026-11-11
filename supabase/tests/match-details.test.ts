/**
 * ADR 0012: statistiche e formazioni delle partite (migrazione 20261111220000).
 * Dati fittizi etichettati DEMO.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { LINEUP_POSITIONS } from "@predictra/shared-types";
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
const AF = "api-football";

let db: PGlite;
let alice: TestUser;

const one = async <T>(tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0] as T;

const run = async (tx: Tx, key: string) =>
  Number(
    (
      await one<{ id: number }>(
        tx,
        "select public.start_ingestion_run($1, 'af.details', $2, 'manual') id",
        [AF, key],
      )
    ).id,
  );

const details = (players = ["DEMO-P1", "DEMO-P2"]) => ({
  observed_at: "2026-11-11T22:00:00Z",
  matches: [
    {
      match_provider_id: "DEMO-M1",
      event_time: "2023-09-01T18:45:00Z",
      teams: [
        {
          team_provider_id: "DEMO-T1",
          statistics: [
            { stat: "shots_on_goal", value: 5 },
            { stat: "ball_possession", value: 58 },
            { stat: "goalkeeper_saves", value: null },
          ],
          lineup: {
            formation: "4-3-3",
            coach_provider_id: "DEMO-C1",
            coach_name: "DEMO Allenatore",
            players: players.map((p, i) => ({
              player_provider_id: p,
              name: `DEMO ${p}`,
              number: i + 1,
              position: i === 0 ? "G" : "F",
              grid: i === 0 ? "1:1" : "4:2",
              starter: i < 1,
            })),
          },
        },
        { team_provider_id: "DEMO-SCONOSCIUTA", statistics: [{ stat: "fouls", value: 3 }] },
      ],
    },
    { match_provider_id: "DEMO-SCONOSCIUTA", teams: [] },
  ],
});

beforeAll(async () => {
  db = await createDatabase();
  alice = await createAuthUser(db, "alice@example.test");
  await grantRole(db, alice.id, "USER");
  // Partita e squadre DEMO di API-Football, scritte con la funzione del contratto M2.
  await asServiceRole(db, async (tx) => {
    const r = await run(tx, "DEMO:seed");
    await tx.query("select public.ingest_football_batch($1, $2)", [
      r,
      JSON.stringify({
        observed_at: "2026-11-11T21:00:00Z",
        competition: { provider_id: "DEMO-C", name: "DEMO Lega", code: "DEMOD", type: "LEAGUE" },
        season: {
          provider_id: "DEMO-S",
          label: "2023/24",
          start_date: "2023-08-12",
          end_date: "2024-05-26",
        },
        teams: [
          { provider_id: "DEMO-T1", name: "DEMO Casa" },
          { provider_id: "DEMO-T2", name: "DEMO Ospite" },
        ],
        matches: [
          {
            provider_id: "DEMO-M1",
            kickoff_at: "2023-09-01T18:45:00Z",
            status: "FINISHED",
            home_team_provider_id: "DEMO-T1",
            away_team_provider_id: "DEMO-T2",
            home_score: 2,
            away_score: 1,
            score_duration: "REGULAR",
            event_time: "2023-09-01T18:45:00Z",
          },
        ],
      }),
    ]);
  });
});

describe("statistiche e formazioni", () => {
  it("scrive statistiche, formazione e giocatori; salta ciò che non è mappato; rieseguire non duplica", async () => {
    await asServiceRole(db, async (tx) => {
      const r = await run(tx, "DEMO:details");
      const first = (
        await one<{ r: Record<string, number> }>(
          tx,
          "select public.ingest_match_details($1, $2) r",
          [r, JSON.stringify(details())],
        )
      ).r;
      expect(first).toEqual({ statistics: 3, lineups: 1, players: 2, skipped: 2 });
      // Seconda esecuzione con un giocatore in meno: la rosa si riscrive per intero.
      await tx.query("select public.ingest_match_details($1, $2)", [
        r,
        JSON.stringify(details(["DEMO-P1"])),
      ]);
      const c = await one<Record<string, number>>(
        tx,
        `select (select count(*)::int from public.match_team_statistics) stats,
                (select count(*)::int from public.match_lineups) lineups,
                (select count(*)::int from public.match_lineup_players) players`,
      );
      expect(c).toEqual({ stats: 3, lineups: 1, players: 1 });
      const s = await one<{ value: string; provider_match_id: string }>(
        tx,
        "select value::text, provider_match_id from public.match_team_statistics where stat = 'ball_possession'",
      );
      expect(s).toEqual({ value: "58.0000", provider_match_id: "DEMO-M1" });
    });
  });

  it("i ruoli ammessi coincidono con i tipi condivisi", async () => {
    const { def } = await one<{ def: string }>(
      db,
      `select pg_get_constraintdef(c.oid) def from pg_constraint c
       where c.conrelid = 'public.match_lineup_players'::regclass and c.contype = 'c'
         and pg_get_constraintdef(c.oid) like '%position%'`,
    );
    for (const p of LINEUP_POSITIONS) expect(def).toContain(`'${p}'`);
  });

  it("valori non validi vengono rifiutati", async () => {
    await asServiceRole(db, async (tx) => {
      const r = await run(tx, "DEMO:bad");
      const bad = details();
      bad.matches[0]!.teams[0]!.statistics = [{ stat: "Shots On Goal", value: 1 }];
      expect(
        await attempt(tx, "select public.ingest_match_details($1, $2)", [r, JSON.stringify(bad)]),
      ).toMatch(/check/i);
    });
  });

  it("lettura per utenti attivi, niente per anon; nessuno scrive direttamente", async () => {
    await asUser(db, alice, async (tx) => {
      const { n } = await one<{ n: number }>(
        tx,
        "select count(*)::int n from public.match_team_statistics",
      );
      expect(n).toBe(3);
      expect(
        await attempt(tx, "select public.ingest_match_details(1, '{}'::jsonb)"),
      ).not.toBeNull();
      expect(
        await attempt(tx, "delete from public.match_lineups where provider = 'api-football'"),
      ).not.toBeNull();
    });
    await asAnon(db, async (tx) => {
      expect(await attempt(tx, "select 1 from public.match_lineups")).not.toBeNull();
    });
  });
});
