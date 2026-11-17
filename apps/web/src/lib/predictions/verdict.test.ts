import { describe, expect, it } from "vitest";
import type { ActivePredictionRow } from "@predictra/shared-types";
import { matchVerdicts } from "./verdict";

const row = (over: Partial<ActivePredictionRow>): ActivePredictionRow => ({
  match_id: 1,
  kickoff_at: "2026-11-20T20:00:00Z",
  match_status: "FINISHED",
  competition_id: 1,
  season_id: 1,
  home_team_name: "DEMO Casa",
  away_team_name: "DEMO Ospite",
  market: "1X2",
  line: null,
  selection: "HOME",
  probability: 0.5,
  push_probability: null,
  confidence_score: 0.5,
  explanation: {},
  as_of: "2026-11-19T12:00:00Z",
  created_at: "2026-11-19T12:00:00Z",
  model_version_id: 1,
  model_key: "dixon_coles",
  model_version: "1",
  ...over,
});

describe("cosa diceva il modello", () => {
  const rows = [
    row({ selection: "HOME", probability: 0.55 }),
    row({ selection: "DRAW", probability: 0.25 }),
    row({ selection: "AWAY", probability: 0.2 }),
    row({ market: "DOUBLE_CHANCE", selection: "HOME_DRAW", probability: 0.8 }),
    row({ market: "DOUBLE_CHANCE", selection: "DRAW_AWAY", probability: 0.45 }),
    row({ market: "TOTAL_GOALS", line: 2.5, selection: "OVER", probability: 0.48 }),
    row({ market: "TOTAL_GOALS", line: 2.5, selection: "UNDER", probability: 0.52 }),
    row({ market: "TOTAL_GOALS", line: 1.5, selection: "OVER", probability: 0.75 }),
    row({ market: "BTTS", selection: "YES", probability: 0.51 }),
    row({ market: "BTTS", selection: "NO", probability: 0.49 }),
  ];

  it("per ogni mercato l'esito più probabile e se è uscito", () => {
    const v = matchVerdicts(rows, { home: 1, away: 1 });
    expect(v.map((x) => [x.market, x.selection, x.won])).toEqual([
      ["1X2", "HOME", false],
      ["DOUBLE_CHANCE", "HOME_DRAW", true],
      ["TOTAL_GOALS", "UNDER", true],
      ["BTTS", "YES", true],
    ]);
    expect(v[2]!.line).toBe(2.5);
  });

  it("senza previsioni nessun verdetto", () => {
    expect(matchVerdicts([], { home: 0, away: 0 })).toEqual([]);
  });
});
