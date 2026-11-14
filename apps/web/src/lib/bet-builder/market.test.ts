import { describe, expect, it } from "vitest";
import { matchMarkets, usedProbability } from "./market";

const row = (
  bookmaker: string,
  italian: boolean,
  prices: [number, number, number],
  overrides: Record<string, unknown> = {},
) => {
  const s = prices.reduce((acc, p) => acc + 1 / p, 0);
  return {
    match_id: 1,
    bookmaker,
    italian_market: italian,
    home_price: prices[0],
    draw_price: prices[1],
    away_price: prices[2],
    home_probability: 1 / prices[0] / s,
    draw_probability: 1 / prices[1] / s,
    away_probability: 1 / prices[2] / s,
    observed_at: "2026-11-12T08:00:00Z",
    freshness: "FRESH" as const,
    quality: "OK" as const,
    ...overrides,
  };
};

describe("mercato per il costruttore manuale (valori DEMO, ADR 0028)", () => {
  it("consenso da tutti i bookmaker, quota giocabile solo italiana", () => {
    const m = matchMarkets([
      row("demo_int", false, [2.0, 3.5, 4.0]),
      row("demo_it", true, [2.4, 3.3, 3.2]),
      row("demo_stale_it", true, [9.0, 9.0, 9.0], { freshness: "STALE" }),
    ]).get(1)!;
    const sInt = 1 / 2.0 + 1 / 3.5 + 1 / 4.0;
    const sIt = 1 / 2.4 + 1 / 3.3 + 1 / 3.2;
    expect(m.consensus.HOME).toBeCloseTo((1 / 2.0 / sInt + 1 / 2.4 / sIt) / 2, 10);
    expect(m.italian.HOME).toEqual({ price: 2.4, bookmaker: "demo_it" });
    expect(m.italian.AWAY).toEqual({ price: 3.2, bookmaker: "demo_it" });
  });

  it("nessun bookmaker italiano: nessuna quota giocabile", () => {
    const m = matchMarkets([row("demo_int", false, [2.0, 3.5, 4.0])]).get(1)!;
    expect(m.italian).toEqual({});
    expect(m.consensus.DRAW).toBeGreaterThan(0);
  });

  it("probabilità usata", () => {
    expect(usedProbability(0.5, 0.4, 0.5)).toBeCloseTo(0.45);
    expect(usedProbability(0.5, undefined, 0.5)).toBe(0.5);
  });
});
