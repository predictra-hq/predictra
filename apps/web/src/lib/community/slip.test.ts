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

describe("chiavi delle giocate condivise (ADR 0070)", () => {
  it("si conservano solo se valide", async () => {
    const { parseSharedSlip, pickKey, parsePickKey } = await import("./slip");
    const key = pickKey({ matchId: 12, market: "TOTAL_GOALS", line: 2.5, selection: "UNDER" });
    expect(key).toBe("12|TOTAL_GOALS|2.5|UNDER");
    expect(parsePickKey(key)).toEqual({
      matchId: 12,
      market: "TOTAL_GOALS",
      line: 2.5,
      selection: "UNDER",
    });
    const slip = parseSharedSlip({
      title: "Doppia",
      picks: [
        { match: "A – B", pick: "Under 2,5", price: 1.8, key },
        { match: "C – D", pick: "1", price: 1.5, key: "boh; drop table" },
      ],
    });
    expect(slip!.picks[0]!.key).toBe(key);
    expect(slip!.picks[1]!.key).toBeUndefined();
  });
});

describe("esito delle schedine condivise (ADR 0070)", () => {
  it("persa alla prima partita sbagliata, vinta quando escono tutte", async () => {
    const { sharedOutcome } = await import("./slip");
    const { settle } = await import("@/lib/certainties/logic");
    const slip = {
      title: "Doppia",
      price: 2,
      probability: 0.5,
      picks: [
        { match: "A – B", pick: "1", price: 1.4, key: "1|1X2||HOME" },
        { match: "C – D", pick: "Over 1,5", price: 1.4, key: "2|TOTAL_GOALS|1.5|OVER" },
      ],
    };
    const won = new Map([
      [1, { home: 2, away: 0, observedAt: "2026-11-24T20:00:00Z" }],
      [2, { home: 1, away: 1, observedAt: "2026-11-24T22:00:00Z" }],
    ]);
    expect(sharedOutcome(slip, won, settle as never)).toEqual({
      outcome: "WON",
      legs: [true, true],
      updatedAt: "2026-11-24T22:00:00Z",
    });
    const pending = new Map([[1, { home: 2, away: 0, observedAt: "2026-11-24T20:00:00Z" }]]);
    expect(sharedOutcome(slip, pending, settle as never).outcome).toBe("PENDING");
    const lost = new Map([[2, { home: 0, away: 0, observedAt: "2026-11-24T22:00:00Z" }]]);
    expect(sharedOutcome(slip, lost, settle as never)).toMatchObject({ outcome: "LOST" });
  });
});
