import { describe, expect, it } from "vitest";
import { expectedValue, fairOdds, groupKellyMatches, parseKellyInput } from "./kelly";

describe("calcolatore Kelly (valori DEMO)", () => {
  it("una voce per partita con le tre probabilità 1X2, in ordine di calcio d'inizio", () => {
    const row = (id: number, kickoff: string, selection: string, probability: number) => ({
      match_id: id,
      kickoff_at: kickoff,
      home_team_name: `DEMO Casa ${id}`,
      away_team_name: `DEMO Ospite ${id}`,
      selection,
      probability,
    });
    const matches = groupKellyMatches([
      row(2, "2026-11-15T18:00:00Z", "HOME", 0.5),
      row(2, "2026-11-15T18:00:00Z", "DRAW", 0.3),
      row(2, "2026-11-15T18:00:00Z", "AWAY", 0.2),
      row(1, "2026-11-14T18:00:00Z", "HOME", 0.4),
      row(1, "2026-11-14T18:00:00Z", "DRAW", 0.3),
      row(1, "2026-11-14T18:00:00Z", "AWAY", 0.3),
      row(3, "2026-11-13T18:00:00Z", "HOME", 0.6), // incompleta: esclusa
    ]);
    expect(matches.map((m) => m.matchId)).toEqual([1, 2]);
    expect(matches[1]!.probabilities).toEqual({ HOME: 0.5, DRAW: 0.3, AWAY: 0.2 });
  });

  it("parametri della pagina", () => {
    expect(parseKellyInput({ km: "42", ks: "DRAW", ko: "3,40" })).toEqual({
      matchId: 42,
      selection: "DRAW",
      odds: 3.4,
      invalidOdds: false,
    });
    expect(parseKellyInput({ km: "x", ks: "OVER", ko: "1" })).toEqual({
      matchId: null,
      selection: null,
      odds: null,
      invalidOdds: true,
    });
    expect(parseKellyInput({}).invalidOdds).toBe(false);
  });

  it("valore atteso e quota equa", () => {
    expect(expectedValue(0.5, 2.2)).toBeCloseTo(0.1);
    expect(expectedValue(0.5, 1.8)).toBeCloseTo(-0.1);
    expect(fairOdds(0.25)).toBe(4);
    expect(fairOdds(0)).toBeNull();
  });
});
