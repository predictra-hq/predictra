import { describe, expect, it } from "vitest";
import { parseSharedSlip, sharedSlipText } from "./slip";

describe("schedine condivise", () => {
  it("accetta solo il formato atteso e taglia i testi lunghi", () => {
    const slip = parseSharedSlip(
      JSON.stringify({
        title: "Solida",
        picks: [
          { match: "DEMO A – DEMO B", pick: "1 · DEMO A", price: 1.5 },
          { match: "", pick: "x" },
          { match: "DEMO C – DEMO D", pick: "Under 3,5", price: "abc" },
        ],
        price: 2.1,
        probability: 0.48,
      }),
    );
    expect(slip).toEqual({
      title: "Solida",
      picks: [
        { match: "DEMO A – DEMO B", pick: "1 · DEMO A", price: 1.5 },
        { match: "DEMO C – DEMO D", pick: "Under 3,5", price: null },
      ],
      price: 2.1,
      probability: 0.48,
    });
    expect(parseSharedSlip("non json")).toBeNull();
    expect(parseSharedSlip(JSON.stringify({ title: "x", picks: [] }))).toBeNull();
    expect(parseSharedSlip(JSON.stringify({ picks: [{ match: "a", pick: "b" }] }))).toBeNull();
  });

  it("testo per altre app: una riga per partita, totali in fondo", () => {
    const text = sharedSlipText(
      {
        title: "Solida",
        picks: [{ match: "DEMO A – DEMO B", pick: "1", price: 1.5 }],
        price: 1.5,
        probability: 0.6,
      },
      { total: "Quota", probability: "Probabilità" },
      (n) => n.toFixed(2).replace(".", ","),
      (n) => `${Math.round(n * 100)}%`,
    );
    expect(text).toBe(
      "🎯 Solida\n• DEMO A – DEMO B: 1 (1,50)\nQuota 1,50 · Probabilità 60%\n— PREDICTRA",
    );
  });
});
