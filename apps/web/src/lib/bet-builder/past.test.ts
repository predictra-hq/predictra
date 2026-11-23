import { describe, expect, it } from "vitest";
import type { Bolletta, BollettaPick } from "./bollette";
import { pastRounds, settleBolletta } from "./past";

const pick = (matchId: number, market: string, selection: string, line: number | null = null) =>
  ({
    matchId,
    kickoffAt: "2026-11-21T15:00:00Z",
    home: "DEMO A",
    away: "DEMO B",
    market,
    line,
    selection,
    probability: 0.7,
    confidence: 0.6,
    modelProbability: 0.7,
    marketProbability: null,
    price: 1.4,
    bookmaker: "DEMO",
    observedAt: "2026-11-20T10:00:00Z",
    edge: 0,
  }) as BollettaPick;

const bolletta = (round: string, picks: BollettaPick[]): Bolletta => ({
  profile: "SOLID",
  round,
  picks,
  probability: 0.5,
  oddsObservedAt: "2026-11-20T10:00:00Z",
  price: 2,
  expectedValue: 0,
});

describe("schedine passate", () => {
  const results = new Map([
    [1, { home: 2, away: 0 }],
    [2, { home: 1, away: 1 }],
  ]);

  it("vinta se escono tutte, persa alla prima sbagliata, in corso altrimenti", () => {
    expect(
      settleBolletta(
        bolletta("2026-11-20", [pick(1, "1X2", "HOME"), pick(2, "BTTS", "YES")]),
        results,
      ).outcome,
    ).toBe("WON");
    const lost = settleBolletta(
      bolletta("2026-11-20", [pick(1, "1X2", "AWAY"), pick(3, "1X2", "HOME")]),
      results,
    );
    expect(lost.outcome).toBe("LOST");
    expect(lost.legs.map((l) => [l.won, l.score])).toEqual([
      [false, "2-0"],
      [null, null],
    ]);
    expect(
      settleBolletta(
        bolletta("2026-11-20", [pick(1, "TOTAL_GOALS", "OVER", 1.5), pick(3, "1X2", "HOME")]),
        results,
      ).outcome,
    ).toBe("PENDING");
  });

  it("solo turni con almeno una partita giocata, dal più recente", () => {
    const rounds = pastRounds(
      [
        bolletta("2026-11-17", [pick(1, "1X2", "HOME")]),
        bolletta("2026-11-20", [pick(2, "1X2", "DRAW")]),
        bolletta("2026-11-24", [pick(9, "1X2", "HOME")]),
      ],
      results,
    );
    expect(rounds.map((r) => [r.round, r.won, r.settled])).toEqual([
      ["2026-11-20", 1, 1],
      ["2026-11-17", 1, 1],
    ]);
  });
});
