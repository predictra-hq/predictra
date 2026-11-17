import { describe, expect, it } from "vitest";
import { parseHistoryCheck, splitMarketKey, toGroupStat } from "./history";

const raw = {
  version: 1,
  matches: 8616,
  threshold: 0.7,
  favourite: { count: 8616, wins: 4500, predicted: 4800.5 },
  exact_score: { count: 8616, wins: 980, predicted: 1100 },
  picks: { count: 9000, wins: 7300, predicted: 7020 },
  bands: [{ from: 0.7, to: 0.75, count: 100, wins: 73, predicted: 72.5 }],
  markets: [{ market: "TOTAL_GOALS:1.5", count: 10, wins: 8, predicted: 7.6 }, { bad: 1 }],
  competitions: [{ competition_id: 3, count: 5, wins: 4, predicted: 3.9 }],
  seasons: [{ season: "2024/25", count: 5, wins: 4, predicted: 3.9 }],
  weeks: [{ week: "2026-11-02", count: 5, wins: 5, predicted: 4 }],
};

describe("verifica storica", () => {
  it("legge il riepilogo del motore e scarta le voci non valide", () => {
    const h = parseHistoryCheck(raw, { checkedAt: "2026-11-17T10:00:00Z" })!;
    expect(h.matches).toBe(8616);
    expect(h.markets).toEqual([{ market: "TOTAL_GOALS:1.5", count: 10, wins: 8, predicted: 7.6 }]);
    expect(h.competitions[0]!.competitionId).toBe(3);
    expect(h.checkedAt).toBe("2026-11-17T10:00:00Z");
  });

  it("senza riepilogo (backtest vecchi) nessuna verifica", () => {
    expect(parseHistoryCheck({})).toBeNull();
    expect(parseHistoryCheck(null)).toBeNull();
    expect(parseHistoryCheck({ ...raw, picks: { count: 1, wins: 5, predicted: 1 } })).toBeNull();
  });

  it("converte nei gruppi della pagina", () => {
    expect(toGroupStat("x", { count: 10, wins: 8, predicted: 7.5 })).toEqual({
      key: "x",
      count: 10,
      wins: 8,
      predicted: 0.75,
      observed: 0.8,
    });
    expect(splitMarketKey("TOTAL_GOALS:2.5")).toEqual({ market: "TOTAL_GOALS", line: 2.5 });
    expect(splitMarketKey("BTTS")).toEqual({ market: "BTTS", line: null });
  });
});
