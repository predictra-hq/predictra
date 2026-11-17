import type { ActivePredictionRow } from "@predictra/shared-types";
import { describe, expect, it } from "vitest";
import { groupStats, totalStat } from "./reliability";

const row = (over: Partial<ActivePredictionRow>): ActivePredictionRow =>
  ({
    match_id: 1,
    competition_id: 1,
    market: "1X2",
    line: null,
    selection: "HOME",
    probability: 0.8,
    ...over,
  }) as ActivePredictionRow;

const results = new Map([
  [1, { home: 2, away: 0 }],
  [2, { home: 0, away: 1 }],
  [3, { home: 1, away: 1 }],
]);

describe("giocate uscite per gruppo", () => {
  const rows = [
    row({ match_id: 1 }),
    row({ match_id: 2, probability: 0.9 }),
    row({ match_id: 3, market: "BTTS", selection: "YES", probability: 0.75 }),
    row({ match_id: 4 }), // senza risultato: non conta
    row({ match_id: 1, probability: 0.6 }), // sotto la soglia: non conta
    row({ match_id: 1, market: "CORRECT_SCORE", selection: "2-0" }), // tipo non ammesso
  ];

  it("conta giocate e uscite per tipo, dal gruppo più numeroso", () => {
    const stats = groupStats(rows, results, (r) => r.market, 0.7);
    expect(stats.map((s) => s.key)).toEqual(["1X2", "BTTS"]);
    expect(stats[0]).toMatchObject({ count: 2, wins: 1, observed: 0.5 });
    expect(stats[0]!.predicted).toBeCloseTo(0.85);
    expect(stats[1]).toMatchObject({ count: 1, wins: 1 });
  });

  it("la probabilità è quella combinata con il mercato, come nelle Certezze", () => {
    // Modello 80%, mercato 50%, peso 0,5 → 65%: sotto la soglia del 70%.
    const stats = groupStats(
      [row({ match_id: 1 })],
      results,
      (r) => r.market,
      0.7,
      () => 0.5,
    );
    expect(stats).toEqual([]);
  });

  it("totale pesato sul numero di giocate", () => {
    const total = totalStat(groupStats(rows, results, (r) => r.market, 0.7));
    expect(total).toMatchObject({ count: 3, wins: 2 });
    expect(total!.predicted).toBeCloseTo((0.8 + 0.9 + 0.75) / 3);
    expect(totalStat([])).toBeNull();
  });
});
