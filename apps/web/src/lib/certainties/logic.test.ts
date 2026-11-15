import { describe, expect, it } from "vitest";
import type { ActivePredictionRow } from "@predictra/shared-types";
import {
  bandStats,
  DEFAULT_THRESHOLD,
  groupByMatch,
  parseThreshold,
  selectPicks,
  settle,
} from "./logic";

const row = (over: Partial<ActivePredictionRow>): ActivePredictionRow => ({
  match_id: 1,
  kickoff_at: "2026-11-20T20:00:00Z",
  match_status: "SCHEDULED",
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

describe("parseThreshold", () => {
  it("accetta solo le soglie previste", () => {
    expect(parseThreshold("80")).toBe(0.8);
    expect(parseThreshold(["90"])).toBe(0.9);
    expect(parseThreshold("77")).toBe(DEFAULT_THRESHOLD);
    expect(parseThreshold(undefined)).toBe(DEFAULT_THRESHOLD);
  });
});

describe("selectPicks", () => {
  it("tiene le selezioni sopra soglia e toglie i doppioni implicati", () => {
    const picks = selectPicks(
      [
        row({ market: "1X2", selection: "HOME", probability: 0.78 }),
        row({ market: "DOUBLE_CHANCE", selection: "HOME_DRAW", probability: 0.9 }),
        row({ market: "DOUBLE_CHANCE", selection: "HOME_AWAY", probability: 0.85 }),
        row({ market: "TOTAL_GOALS", line: 0.5, selection: "OVER", probability: 0.95 }),
        row({ market: "TOTAL_GOALS", line: 1.5, selection: "OVER", probability: 0.8 }),
        row({ market: "TOTAL_GOALS", line: 2.0, selection: "OVER", probability: 0.76 }),
        row({ market: "TOTAL_GOALS", line: 4.5, selection: "UNDER", probability: 0.92 }),
        row({ market: "TOTAL_GOALS", line: 3.5, selection: "UNDER", probability: 0.76 }),
        row({ market: "BTTS", selection: "NO", probability: 0.6 }),
        row({ market: "CORRECT_SCORE", selection: "OTHER", probability: 0.9 }),
      ],
      0.75,
    );
    expect(picks.map((p) => `${p.market}:${p.line ?? ""}:${p.selection}`)).toEqual([
      "TOTAL_GOALS:1.5:OVER",
      "1X2::HOME",
      "TOTAL_GOALS:3.5:UNDER",
    ]);
  });

  it("raggruppa per partita in ordine di calcio d'inizio", () => {
    const picks = selectPicks(
      [
        row({ match_id: 2, kickoff_at: "2026-11-21T20:00:00Z", probability: 0.8 }),
        row({ match_id: 1, probability: 0.8 }),
      ],
      0.75,
    );
    expect(groupByMatch(picks).map((g) => g.matchId)).toEqual([1, 2]);
  });
});

describe("settle", () => {
  it("risolve i mercati secchi dal risultato", () => {
    expect(settle("1X2", null, "HOME", 2, 1)).toBe(true);
    expect(settle("DOUBLE_CHANCE", null, "DRAW_AWAY", 1, 1)).toBe(true);
    expect(settle("DOUBLE_CHANCE", null, "HOME_AWAY", 1, 1)).toBe(false);
    expect(settle("TOTAL_GOALS", 2.5, "UNDER", 1, 1)).toBe(true);
    expect(settle("BTTS", null, "YES", 1, 0)).toBe(false);
    expect(settle("TEAM_GOALS", 0.5, "AWAY_OVER", 0, 1)).toBe(true);
    expect(settle("ASIAN_HANDICAP", 0.5, "HOME", 1, 0)).toBeNull();
  });
});

describe("bandStats", () => {
  it("conta uscite e probabilità media per fascia", () => {
    const stats = bandStats(
      [
        row({ match_id: 1, probability: 0.81 }),
        row({ match_id: 2, probability: 0.83 }),
        row({ match_id: 3, probability: 0.95 }),
        row({ match_id: 4, probability: 0.95 }),
      ],
      new Map([
        [1, { home: 2, away: 0 }],
        [2, { home: 0, away: 0 }],
        [3, { home: 1, away: 0 }],
      ]),
    );
    const band80 = stats.find((s) => s.from === 0.8)!;
    expect(band80.count).toBe(2);
    expect(band80.wins).toBe(1);
    expect(band80.observed).toBe(0.5);
    expect(band80.predicted).toBeCloseTo(0.82);
    expect(stats.at(-1)!.count).toBe(1);
    expect(stats[0]!.observed).toBeNull();
  });
});
