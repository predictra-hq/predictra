import { describe, expect, it } from "vitest";
import { byKey, byMonth, extremes, type BreakdownBet } from "./breakdown";

const bet = (over: Partial<BreakdownBet>): BreakdownBet => ({
  status: "WON",
  stake: 10,
  profit: 5,
  settled_at: "2026-11-10T20:00:00Z",
  market: "DEMO multipla",
  bookmaker: "DEMO sito",
  ...over,
});

describe("come sto andando", () => {
  const bets = [
    bet({}),
    bet({ status: "LOST", profit: -10, settled_at: "2026-11-12T20:00:00Z" }),
    bet({ profit: 20, settled_at: "2026-10-03T20:00:00Z", bookmaker: null }),
    bet({ status: "OPEN", profit: null, settled_at: null }),
  ];

  it("per mese, dal più recente, senza le giocate aperte", () => {
    expect(byMonth(bets)).toEqual([
      { key: "2026-11", bets: 2, wins: 1, staked: 20, profit: -5, yield: -0.25 },
      { key: "2026-10", bets: 1, wins: 1, staked: 10, profit: 20, yield: 2 },
    ]);
  });

  it("per sito, dal profitto più alto, con una voce per chi non lo ha indicato", () => {
    const rows = byKey(bets, (b) => b.bookmaker, "Non indicato");
    expect(rows.map((r) => [r.key, r.profit])).toEqual([
      ["Non indicato", 20],
      ["DEMO sito", -5],
    ]);
  });

  it("giocata migliore e peggiore", () => {
    const x = extremes(bets)!;
    expect([Number(x.best.profit), Number(x.worst.profit)]).toEqual([20, -10]);
    expect(extremes([bet({ status: "OPEN", profit: null })])).toBeNull();
  });
});
