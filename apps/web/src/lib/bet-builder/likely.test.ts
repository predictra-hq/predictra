import { describe, expect, it } from "vitest";
import { bestPicks, likelyMultiples, type LikelyRow } from "./likely";

const row = (
  match: number,
  market: string,
  selection: string,
  probability: number,
  line: number | null = null,
  confidence = 0.8,
): LikelyRow => ({
  match_id: match,
  kickoff_at: `2026-11-2${match}T18:00:00Z`,
  home_team_name: `DEMO Casa ${match}`,
  away_team_name: `DEMO Ospite ${match}`,
  market,
  line,
  selection,
  probability,
  confidence_score: confidence,
});

describe("le più probabili (valori DEMO)", () => {
  it("per ogni partita il pronostico più probabile tra i mercati ammessi", () => {
    const picks = bestPicks([
      row(1, "1X2", "HOME", 0.62),
      row(1, "DOUBLE_CHANCE", "HOME_DRAW", 0.84),
      row(1, "TOTAL_GOALS", "OVER", 0.95, 0.5), // linea non ammessa
      row(1, "TOTAL_GOALS", "OVER", 0.93, 1.5), // quasi certo: escluso
      row(1, "CORRECT_SCORE", "1-0", 0.99), // mercato non ammesso
      row(2, "BTTS", "YES", 0.66),
      row(2, "TOTAL_GOALS", "UNDER", 0.7, 3.5),
      row(2, "1X2", "AWAY", 0.8, null, 0.3), // Confidence Score bassa: esclusa
      row(3, "1X2", "DRAW", 0.3), // sotto il 50%: nessun pronostico
    ]);
    expect(picks.map((p) => [p.matchId, p.market, p.selection, p.line])).toEqual([
      [1, "DOUBLE_CHANCE", "HOME_DRAW", null],
      [2, "TOTAL_GOALS", "UNDER", 3.5],
    ]);
  });

  it("multiple più probabili: prodotto delle probabilità, quota equa 1/p", () => {
    const picks = bestPicks([
      row(1, "DOUBLE_CHANCE", "HOME_DRAW", 0.8),
      row(2, "BTTS", "NO", 0.6),
      row(3, "TOTAL_GOALS", "UNDER", 0.7, 2.5, 0.5),
    ]);
    const [two, three] = likelyMultiples(picks);
    expect(two!.picks.map((p) => p.matchId)).toEqual([1, 3]);
    expect(two!.probability).toBeCloseTo(0.56);
    expect(two!.fairOdds).toBeCloseTo(1 / 0.56);
    expect(two!.confidence).toBe(0.5);
    expect(three!.probability).toBeCloseTo(0.336);
    expect(likelyMultiples(picks)).toHaveLength(2); // con 3 partite non c'è la quadrupla
  });
});
