import { describe, expect, it } from "vitest";
import type { ActivePredictionRow } from "@predictra/shared-types";
import {
  confidenceTone,
  emptyPredictionsReason,
  formatFairOdds,
  formatLine,
  formatPercent,
  groupPredictions,
  relativeDelta,
  sortSelections,
  topScores,
} from "./format";

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
  confidence_score: 0.35,
  explanation: {},
  as_of: "2026-11-19T12:00:00Z",
  created_at: "2026-11-19T12:00:00Z",
  model_version_id: 1,
  model_key: "poisson",
  model_version: "poisson-x-abc1234",
  ...over,
});

describe("raggruppamento", () => {
  it("per mercato nell'ordine stabilito e per linea crescente", () => {
    const groups = groupPredictions([
      row({ market: "TOTAL_GOALS", line: 3.5, selection: "OVER" }),
      row({ market: "TOTAL_GOALS", line: 2.5, selection: "OVER" }),
      row({ market: "1X2", selection: "HOME" }),
      row({ market: "1X2", selection: "DRAW" }),
    ]);
    expect(groups.map((g) => [g.market, g.line, g.rows.length])).toEqual([
      ["1X2", null, 2],
      ["TOTAL_GOALS", 2.5, 1],
      ["TOTAL_GOALS", 3.5, 1],
    ]);
  });

  it("risultato esatto ordinato per probabilità, OTHER in fondo", () => {
    const [group] = groupPredictions([
      row({ market: "CORRECT_SCORE", selection: "OTHER", probability: 0.3 }),
      row({ market: "CORRECT_SCORE", selection: "1-0", probability: 0.1 }),
      row({ market: "CORRECT_SCORE", selection: "1-1", probability: 0.12 }),
    ]);
    expect(sortSelections(group!).map((r) => r.selection)).toEqual(["1-1", "1-0", "OTHER"]);
  });
});

describe("formattazione", () => {
  it("percentuali, quote eque e linee", () => {
    expect(formatPercent(0.4567)).toBe("45,7%");
    expect(formatPercent(null)).toBe("–");
    expect(formatFairOdds(0.25)).toBe("4,00");
    expect(formatFairOdds(0)).toBe("–");
    expect(formatLine(2.5, "TOTAL_GOALS")).toBe("2,5");
    expect(formatLine(-0.5, "ASIAN_HANDICAP")).toBe("−0,5");
    expect(formatLine(1, "EUROPEAN_HANDICAP")).toBe("+1");
    expect(formatLine(0, "ASIAN_HANDICAP")).toBe("0");
    expect(formatLine(null, "1X2")).toBe("");
  });

  it("toni del Confidence Score e confronto con la baseline", () => {
    expect(confidenceTone(0.2)).toBe("negative");
    expect(confidenceTone(0.5)).toBe("warning");
    expect(confidenceTone(0.8)).toBe("positive");
    expect(relativeDelta(1.0238, 1.0902)).toBeCloseTo(-0.0609, 4);
    expect(relativeDelta(null, 1)).toBeNull();
  });
});

describe("pannello vuoto", () => {
  const now = new Date("2026-11-08T16:00:00Z");
  it("spiega il motivo", () => {
    expect(
      emptyPredictionsReason({
        hasActiveModel: false,
        status: "SCHEDULED",
        kickoffAt: "2026-11-09T20:00:00Z",
        now,
      }),
    ).toBe("NO_ACTIVE_MODEL");
    expect(
      emptyPredictionsReason({
        hasActiveModel: true,
        status: "FINISHED",
        kickoffAt: "2026-11-01T20:00:00Z",
        now,
      }),
    ).toBe("NOT_UPCOMING");
    expect(
      emptyPredictionsReason({
        hasActiveModel: true,
        status: "SCHEDULED",
        kickoffAt: "2026-11-08T15:00:00Z",
        now,
      }),
    ).toBe("NOT_UPCOMING");
    expect(
      emptyPredictionsReason({
        hasActiveModel: true,
        status: "SCHEDULED",
        kickoffAt: "2026-11-20T20:00:00Z",
        now,
      }),
    ).toBe("NOT_YET_EVALUATED");
  });
});

describe("risultati più probabili", () => {
  const score = (selection: string, probability: number) =>
    ({ market: "CORRECT_SCORE", selection, probability }) as unknown as ActivePredictionRow;

  it("ordina per probabilità, senza Altro e senza gli altri mercati", () => {
    const rows = [
      score("0-0", 0.08),
      score("1-1", 0.12),
      score("OTHER", 0.3),
      score("2-1", 0.1),
      { market: "1X2", selection: "HOME", probability: 0.5 } as unknown as ActivePredictionRow,
    ];
    expect(topScores(rows, 2)).toEqual([
      { score: "1-1", probability: 0.12 },
      { score: "2-1", probability: 0.1 },
    ]);
  });

  it("senza righe di risultato esatto non mostra nulla", () => {
    expect(topScores([])).toEqual([]);
  });
});
