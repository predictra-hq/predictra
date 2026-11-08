import { describe, expect, it } from "vitest";
import { MARKET_CATALOG, marketAvailability } from "./markets";

const byKey = (key: string) => MARKET_CATALOG.find((m) => m.key === key)!;

describe("disponibilità dei mercati (ADR 0005)", () => {
  it("1X2 disponibile solo se è nel database e ci sono eventi con quote", () => {
    const h2h = byKey("h2h");
    expect(marketAvailability(h2h, new Set(["h2h"]), 51)).toBe("available");
    expect(marketAvailability(h2h, new Set(["h2h"]), 0)).toBe("noOddsYet");
    expect(marketAvailability(h2h, new Set(), 51)).toBe("noOdds");
  });

  it("corner, cartellini, tiri e marcatori sono sempre non valutabili", () => {
    for (const key of ["corners", "cards", "shots", "scorers", "playerMarkets", "halves"]) {
      expect(marketAvailability(byKey(key), new Set(["h2h", key]), 100)).toBe("unevaluable");
    }
  });

  it("i mercati del modello gol non hanno quote in v1", () => {
    for (const key of ["overUnder", "bothTeamsToScore", "doubleChance", "handicap"]) {
      expect(marketAvailability(byKey(key), new Set(["h2h"]), 100)).toBe("noOdds");
    }
  });

  it("solo un mercato è raccolto in v1 (ADR 0015)", () => {
    expect(MARKET_CATALOG.filter((m) => m.tier === "collected").map((m) => m.key)).toEqual(["h2h"]);
  });
});
