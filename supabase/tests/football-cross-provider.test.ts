/**
 * ADR 0011: abbinamento tra provider in ingest_football_batch
 * (migrazione 20261111160000_football_cross_provider.sql).
 * Dati fittizi etichettati DEMO.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asServiceRole, createDatabase } from "./harness";

type Tx = Pick<PGlite, "query" | "exec">;

const FD = "football-data-org";
const AF = "api-football";

let db: PGlite;

beforeAll(async () => {
  db = await createDatabase();
});

const one = async <T>(tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0] as T;

const startRun = async (tx: Tx, provider: string, key: string) =>
  Number(
    (
      await one<{ id: number }>(
        tx,
        "select public.start_ingestion_run($1, 'demo.competition', $2, 'manual') id",
        [provider, key],
      )
    ).id,
  );

const ingest = async (tx: Tx, runId: number, b: unknown) =>
  (
    await one<{ r: Record<string, number> }>(tx, "select public.ingest_football_batch($1, $2) r", [
      runId,
      JSON.stringify(b),
    ])
  ).r;

interface Team {
  provider_id: string;
  name: string;
  short_name?: string;
  same_as_team_id?: number;
}

const batch = (
  prefix: string,
  seasonStart: string,
  teams: Team[],
  kickoff: string,
  score: [number, number],
) => ({
  observed_at: "2026-11-11T10:00:00Z",
  competition: {
    provider_id: `${prefix}-C`,
    name: `DEMO Lega ${prefix}`,
    code: "DEMOX",
    type: "LEAGUE",
    area_name: "DEMO",
    area_code: "ITA",
  },
  season: {
    provider_id: `${prefix}-S-${seasonStart}`,
    label: seasonStart.slice(0, 4),
    start_date: seasonStart,
    end_date: "2026-06-30",
  },
  teams,
  matches: [
    {
      provider_id: `${prefix}-M-${kickoff}`,
      matchday: 1,
      stage: "REGULAR_SEASON",
      kickoff_at: kickoff,
      status: "FINISHED",
      home_team_provider_id: teams[0]!.provider_id,
      away_team_provider_id: teams[1]!.provider_id,
      home_score: score[0],
      away_score: score[1],
      score_duration: "REGULAR",
      event_time: kickoff,
    },
  ],
});

describe("abbinamento tra provider", () => {
  it("squadre, stagione e partita già note non si duplicano e restano del primo provider", async () => {
    await asServiceRole(db, async (tx) => {
      const fdRun = await startRun(tx, FD, "DEMO:fd");
      await ingest(
        tx,
        fdRun,
        batch(
          "FD",
          "2025-08-16",
          [
            { provider_id: "FD-1", name: "DEMO Football Club Alfa", short_name: "DEMO Alfa" },
            { provider_id: "FD-2", name: "DEMO Football Club Beta", short_name: "DEMO Beta" },
          ],
          "2025-08-17T18:45:00Z",
          [2, 1],
        ),
      );

      const afRun = await startRun(tx, AF, "DEMO:af");
      const r = await ingest(
        tx,
        afRun,
        batch(
          "AF",
          // stessa stagione con un giorno di differenza; partita con orario leggermente diverso
          "2025-08-17",
          [
            { provider_id: "AF-10", name: "DEMO Alfa" },
            { provider_id: "AF-20", name: "DEMO Beta" },
          ],
          "2025-08-17T19:00:00Z",
          [2, 1],
        ),
      );
      expect(r).toMatchObject({ teams_matched: 2, teams_unmatched: 0, matches_matched: 1 });

      const c = await one<Record<string, number>>(
        tx,
        `select (select count(*)::int from public.competitions where code = 'DEMOX') competitions,
                (select count(*)::int from public.seasons s join public.competitions c on c.id = s.competition_id
                  where c.code = 'DEMOX') seasons,
                (select count(*)::int from public.teams where name like 'DEMO Football Club%') teams,
                (select count(*)::int from public.matches m join public.competitions c on c.id = m.competition_id
                  where c.code = 'DEMOX') matches`,
      );
      expect(c).toEqual({ competitions: 1, seasons: 1, teams: 2, matches: 1 });

      // Nomi e proprietà restano quelli di football-data.org.
      const owners = await tx.query<{ provider: string; name: string }>(
        `select provider, name from public.competitions where code = 'DEMOX'
         union all
         select provider, name from public.teams where name like 'DEMO%Alfa%'`,
      );
      expect(owners.rows).toEqual([
        { provider: FD, name: "DEMO Lega FD" },
        { provider: FD, name: "DEMO Football Club Alfa" },
      ]);

      // Gli ID di API-Football sono mappati sulle entità esistenti.
      const mapped = await one<{ n: number }>(
        tx,
        `select count(*)::int n from public.provider_entity_map
         where provider = $1 and provider_entity_id in ('AF-10', 'AF-20', 'AF-M-2025-08-17T19:00:00Z')`,
        [AF],
      );
      expect(mapped.n).toBe(3);

      // Rieseguire il lotto di API-Football non cambia nulla.
      const again = await ingest(
        tx,
        afRun,
        batch(
          "AF",
          "2025-08-17",
          [
            { provider_id: "AF-10", name: "DEMO Alfa" },
            { provider_id: "AF-20", name: "DEMO Beta" },
          ],
          "2025-08-17T19:00:00Z",
          [2, 1],
        ),
      );
      expect(again).toMatchObject({ teams_matched: 0, teams_unmatched: 0, matches_matched: 0 });
    });
  });

  it("squadra nuova: segnalata solo in una stagione con dati di un altro provider", async () => {
    await asServiceRole(db, async (tx) => {
      const afRun = await startRun(tx, AF, "DEMO:af2");
      // Stagione storica coperta solo da API-Football: una squadra nuova è normale.
      const storica = await ingest(
        tx,
        afRun,
        batch(
          "AF",
          "2023-08-19",
          [
            { provider_id: "AF-10", name: "DEMO Alfa" },
            { provider_id: "AF-99", name: "DEMO Gamma Retrocessa" },
          ],
          "2023-08-20T18:45:00Z",
          [0, 0],
        ),
      );
      expect(storica).toMatchObject({ teams_unmatched: 0, matches_matched: 0 });

      // Stessa stagione di football-data.org: una squadra nuova è sospetta.
      const comune = await ingest(
        tx,
        afRun,
        batch(
          "AF",
          "2025-08-17",
          [
            { provider_id: "AF-10", name: "DEMO Alfa" },
            { provider_id: "AF-98", name: "DEMO Gamma Sconosciuta" },
          ],
          "2025-08-24T18:45:00Z",
          [1, 1],
        ),
      );
      expect(comune).toMatchObject({ teams_unmatched: 1 });

      const issue = await one<{ n: number; name: string }>(
        tx,
        `select count(*)::int n, min(details ->> 'name') name from public.data_quality_issues
         where check_code = 'team.cross_provider_unmatched' and provider = $1 and status = 'OPEN'`,
        [AF],
      );
      expect(issue).toEqual({ n: 1, name: "DEMO Gamma Sconosciuta" });

      const seasons = await one<{ n: number }>(
        tx,
        `select count(*)::int n from public.seasons s join public.competitions c on c.id = s.competition_id
         where c.code = 'DEMOX'`,
      );
      expect(seasons.n).toBe(2);
    });
  });

  it("il suggerimento same_as_team_id abbina nomi diversi; un ID inesistente si ignora", async () => {
    await asServiceRole(db, async (tx) => {
      const fdRun = await startRun(tx, FD, "DEMO:fd-hint");
      await ingest(
        tx,
        fdRun,
        batch(
          "FD",
          "2021-08-14",
          [
            {
              provider_id: "FDH-1",
              name: "DEMO Fußball Club Delta München",
              short_name: "DEMO Delta",
            },
            { provider_id: "FDH-2", name: "DEMO Epsilon", short_name: "DEMO Eps" },
          ],
          "2021-08-15T13:30:00Z",
          [3, 0],
        ),
      );
      const delta = await one<{ id: number }>(
        tx,
        "select id from public.teams where name = 'DEMO Fußball Club Delta München'",
      );

      const afRun = await startRun(tx, AF, "DEMO:af-hint");
      const r = await ingest(
        tx,
        afRun,
        batch(
          "AF",
          "2021-08-14",
          [
            { provider_id: "AF-50", name: "DEMO Delta Munchen", same_as_team_id: Number(delta.id) },
            { provider_id: "AF-51", name: "DEMO Eps Nuova", same_as_team_id: 999999999 },
          ],
          "2021-08-15T13:30:00Z",
          [3, 0],
        ),
      );
      expect(r).toMatchObject({ teams_matched: 1, teams_unmatched: 1 });
      const mapped = await one<{ entity_id: number }>(
        tx,
        "select entity_id from public.provider_entity_map where provider = $1 and provider_entity_id = 'AF-50'",
        [AF],
      );
      expect(Number(mapped.entity_id)).toBe(Number(delta.id));
    });
  });

  it("un alias ambiguo non abbina", async () => {
    // Due squadre diverse con lo stesso alias "DEMO Omonima" (inserite come proprietario).
    await db.exec(`
      insert into public.teams (name, provider, observed_at) values
        ('DEMO Omonima Uno', '${FD}', now()), ('DEMO Omonima Due', '${FD}', now());
      insert into public.team_aliases (team_id, alias, source)
        select id, 'DEMO Omonima', 'manual-' || id from public.teams where name like 'DEMO Omonima %';
    `);
    await asServiceRole(db, async (tx) => {
      const t = await one<{ id: number | null }>(
        tx,
        "select app_private.team_by_alias('DEMO Omonima') id",
      );
      expect(t.id).toBeNull();
    });
  });
});
