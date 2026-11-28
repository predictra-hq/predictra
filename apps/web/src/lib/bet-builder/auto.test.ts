import { describe, expect, it } from "vitest";
import {
  analyzeSlip,
  autoBuild,
  parseAutoLegs,
  parseAutoLevel,
  safestOf,
  type OptionLike,
  type Selection,
} from "./auto";
import { selectionKey } from "./evaluate";

const NOW = new Date("2026-11-28T10:00:00Z");
const LATER = "2026-11-29T15:00:00Z";

let nextMatch = 1;
function sel(
  matchId: number,
  selection: string,
  probability: number | null,
  price: number | null,
  extra: Partial<Selection> = {},
): Selection {
  return {
    matchId,
    homeTeam: `DEMO Casa ${matchId}`,
    awayTeam: `DEMO Ospite ${matchId}`,
    kickoffAt: LATER,
    market: "1X2",
    line: null,
    selection,
    probability,
    confidence: 0.7,
    price,
    freshness: "FRESH",
    ...extra,
  };
}

/** Partita DEMO con le sue giocate. */
function match(
  outcomes: [string, number | null, number | null, Partial<Selection>?][],
): OptionLike {
  const id = nextMatch++;
  return {
    matchId: id,
    kickoffAt: LATER,
    outcomes: outcomes.map(([s, p, q, extra]) => sel(id, s, p, q, extra)),
  };
}

describe("costruiscila per me", () => {
  it("per ogni partita sceglie la giocata più probabile con quota reale, entro i limiti", () => {
    const m = match([
      ["HOME", 0.6, 1.6],
      ["HOME_DRAW", 0.95, 1.05, { market: "DOUBLE_CHANCE" }], // quasi certa: esclusa
      ["OVER", 0.7, null, { market: "TOTAL_GOALS", line: 2.5 }], // senza quota: esclusa
      ["UNDER", 0.65, 1.5, { market: "TOTAL_GOALS", line: 3.5, confidence: 0.2 }], // poca fiducia
      ["AWAY", 0.62, 1.7, { kickoffAt: "2026-11-27T15:00:00Z" }], // già iniziata
    ]);
    expect(safestOf(m.outcomes, NOW)?.selection).toBe("HOME");
  });

  it("senza numero di partite prende la più lunga che resta sopra la soglia del livello", () => {
    const options = [0.85, 0.8, 0.78, 0.75, 0.7, 0.68, 0.66].map((p) => match([["HOME", p, 1.3]]));
    const prudent = autoBuild(options, "CONSERVATIVE", null, NOW);
    // 0,85 × 0,8 = 0,68; × 0,78 = 0,53; × 0,75 = 0,40 < 0,5: si ferma a 3.
    expect(prudent.selections).toHaveLength(3);
    expect(prudent.reached).toBe("CONSERVATIVE");
    const bold = autoBuild(options, "AGGRESSIVE", null, NOW);
    expect(bold.selections.length).toBeGreaterThan(prudent.selections.length);
    expect(bold.selections.length).toBeLessThanOrEqual(6);
    // Dalla più sicura.
    expect(bold.selections.map((s) => s.probability)).toEqual(
      [...bold.selections.map((s) => s.probability)].sort((a, b) => b! - a!),
    );
  });

  it("con un numero fisso di partite dice il livello raggiunto davvero", () => {
    const options = [0.7, 0.65, 0.6, 0.58].map((p) => match([["HOME", p, 1.6]]));
    const result = autoBuild(options, "CONSERVATIVE", 4, NOW);
    expect(result.selections).toHaveLength(4);
    expect(result.reached).toBe("AGGRESSIVE");
  });

  it("non mette due volte la stessa squadra e senza dati non inventa nulla", () => {
    const a = match([["HOME", 0.8, 1.3]]);
    const b: OptionLike = {
      matchId: 999,
      kickoffAt: LATER,
      outcomes: [
        sel(999, "AWAY", 0.75, 1.4, { homeTeam: "DEMO Altra", awayTeam: a.outcomes[0]!.homeTeam }),
      ],
    };
    expect(autoBuild([a, b], "AGGRESSIVE", null, NOW).selections).toHaveLength(1);
    expect(autoBuild([], "BALANCED", null, NOW)).toEqual({
      selections: [],
      probability: null,
      reached: null,
    });
  });

  it("legge livello e numero di partite solo se validi", () => {
    expect(parseAutoLevel("BALANCED")).toBe("BALANCED");
    expect(parseAutoLevel("SICURA")).toBeNull();
    expect(parseAutoLegs("3")).toBe(3);
    expect(parseAutoLegs("12")).toBeNull();
    expect(parseAutoLegs(undefined)).toBeNull();
  });
});

describe("analisi della schedina", () => {
  it("probabilità, giocata più debole e cosa cambierebbe, dalla modifica più utile", () => {
    const a = match([
      ["HOME", 0.8, 1.3],
      ["DRAW", 0.15, 4],
    ]);
    const b = match([
      ["AWAY", 0.45, 2.1],
      ["HOME_DRAW", 0.55, 1.7, { market: "DOUBLE_CHANCE" }],
      ["DRAW_AWAY", 0.75, 1.3, { market: "DOUBLE_CHANCE" }],
    ]);
    const selected = [a.outcomes[0]!, b.outcomes[0]!];
    const analysis = analyzeSlip(selected, [a, b], NOW)!;
    expect(analysis.probability).toBeCloseTo(0.36);
    expect(analysis.outOf100).toBe(36);
    expect(analysis.category).toBe("BALANCED");
    expect(analysis.weakest.selection).toBe("AWAY");
    // Togliere la più debole (0,8) vale più che sostituirla con la doppia chance (0,6).
    expect(analysis.whatIfs.map((w) => [w.kind, w.probability])).toEqual([
      ["remove", 0.8],
      ["swap", expect.closeTo(0.6)],
      ["remove", 0.45],
    ]);
    const swap = analysis.whatIfs[1]!;
    expect(swap.to?.selection).toBe("DRAW_AWAY");
    expect(swap.keys).toEqual([selectionKey(a.outcomes[0]!), selectionKey(b.outcomes[2]!)]);
    expect(swap.price).toBeCloseTo(1.69);
  });

  it("senza probabilità del modello non analizza", () => {
    const a = match([["HOME", null, 1.5]]);
    expect(analyzeSlip([a.outcomes[0]!], [a], NOW)).toBeNull();
    expect(analyzeSlip([], [], NOW)).toBeNull();
  });
});
