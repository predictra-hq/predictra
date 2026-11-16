import { describe, expect, it } from "vitest";
import { parseAlertThreshold, soonPicks } from "./alerts";

describe("avvisi in Home", () => {
  it("soglia: solo i valori previsti", () => {
    expect(parseAlertThreshold("90")).toBe(90);
    expect(parseAlertThreshold("77")).toBe(85);
    expect(parseAlertThreshold(undefined)).toBe(85);
  });

  it("giocate sopra soglia entro 36 ore, una per partita, dalla più vicina", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const pick = (matchId: number, kickoffAt: string, probability: number) => ({
      matchId,
      kickoffAt,
      probability,
    });
    const picks = [
      pick(1, "2026-11-21T15:00:00Z", 0.9),
      pick(2, "2026-11-20T20:00:00Z", 0.86),
      pick(2, "2026-11-20T20:00:00Z", 0.88),
      pick(3, "2026-11-20T20:00:00Z", 0.84), // sotto soglia
      pick(4, "2026-11-23T20:00:00Z", 0.95), // troppo lontana
      pick(5, "2026-11-20T09:00:00Z", 0.95), // già iniziata
    ];
    expect(soonPicks(picks, now, 85).map((p) => [p.matchId, p.probability])).toEqual([
      [2, 0.88],
      [1, 0.9],
    ]);
  });
});
