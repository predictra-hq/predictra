import { describe, expect, it } from "vitest";
import {
  evaluateSelections,
  parseSelectionKeys,
  selectionKey,
  type ManualSelection,
} from "./evaluate";

const NOW = new Date("2026-11-20T08:00:00Z");

const sel = (over: Partial<ManualSelection> = {}): ManualSelection => ({
  matchId: 1,
  homeTeam: "DEMO A",
  awayTeam: "DEMO B",
  kickoffAt: "2026-11-21T15:00:00Z",
  selection: "HOME",
  probability: 0.5,
  confidence: 0.6,
  price: 2.5,
  freshness: "FRESH",
  ...over,
});

describe("valutazione manuale (ADR 0025–0027)", () => {
  it("multipla su partite diverse: stessi numeri del database", () => {
    const e = evaluateSelections(
      [
        sel(),
        sel({
          matchId: 2,
          homeTeam: "DEMO C",
          awayTeam: "DEMO D",
          probability: 0.55,
          confidence: 0.5,
          price: 2.2,
        }),
      ],
      NOW,
    );
    expect(e.probability).toBeCloseTo(0.275, 12);
    expect(e.price).toBeCloseTo(5.5, 12);
    expect(e.expectedValue).toBeCloseTo(0.5125, 12);
    expect(e.confidence).toBe(0.5);
    expect(e.category).toBe("BALANCED");
    expect(e.meetsRules).toBe(true);
    expect(e.warnings).toEqual([]);
  });

  it("stessa partita: non modellabile, nessun numero", () => {
    const e = evaluateSelections([sel(), sel({ selection: "DRAW", probability: 0.25 })], NOW);
    expect(e.modellable).toBe(false);
    expect(e.probability).toBeNull();
    expect(e.expectedValue).toBeNull();
    expect(e.warnings).toContain("SAME_MATCH");
  });

  it("stessa squadra in due partite: esclusa", () => {
    const e = evaluateSelections([sel(), sel({ matchId: 2, awayTeam: "DEMO Z" })], NOW);
    expect(e.modellable).toBe(false);
    expect(e.warnings).toEqual(["SAME_TEAM"]);
  });

  it("avvisi: quota STALE, EV negativo, Confidence bassa, sotto soglia", () => {
    const e = evaluateSelections(
      [sel({ probability: 0.25, price: 3.4, confidence: 0.3, freshness: "STALE" })],
      NOW,
    );
    expect(e.expectedValue).toBeCloseTo(-0.15, 12);
    expect(e.warnings).toEqual(["STALE_ODDS", "LOW_CONFIDENCE", "NEGATIVE_EV", "BELOW_THRESHOLDS"]);
    expect(e.meetsRules).toBe(false);
  });

  it("senza previsione o senza quota: niente EV", () => {
    const e = evaluateSelections(
      [
        sel({ probability: null }),
        sel({ matchId: 3, homeTeam: "X", awayTeam: "Y", price: null, freshness: null }),
      ],
      NOW,
    );
    expect(e.probability).toBeNull();
    expect(e.price).toBeNull();
    expect(e.expectedValue).toBeNull();
    expect(e.warnings).toEqual(["NO_PREDICTION", "NO_ODDS"]);
  });

  it("partita già iniziata e troppe selezioni", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      sel({ matchId: i + 1, homeTeam: `H${i}`, awayTeam: `A${i}` }),
    );
    expect(evaluateSelections(many, NOW).warnings).toContain("TOO_MANY");
    const started = evaluateSelections([sel({ kickoffAt: "2026-11-20T07:00:00Z" })], NOW);
    expect(started.warnings).toContain("STARTED");
    expect(started.meetsRules).toBe(false);
  });

  it("nessuna selezione", () => {
    const e = evaluateSelections([], NOW);
    expect(e.modellable).toBe(false);
    expect(e.probability).toBeNull();
  });
});

describe("chiavi delle selezioni nei form", () => {
  it("accetta solo <id>:<1X2>, senza duplicati, al massimo 10", () => {
    const one = (
      matchId: number,
      selection: string,
      market = "1X2",
      line: number | null = null,
    ) => ({
      matchId,
      market,
      line,
      selection,
    });
    expect(
      parseSelectionKeys(["5:HOME", "5:DRAW", "6:DRAW", "x:HOME", "7:OVER", "0:HOME"]),
    ).toEqual([one(5, "HOME"), one(6, "DRAW")]);
    expect(parseSelectionKeys("9:AWAY")).toEqual([one(9, "AWAY")]);
    expect(parseSelectionKeys(undefined)).toEqual([]);
    const many = Array.from({ length: 15 }, (_, i) => `${i + 1}:HOME`);
    expect(parseSelectionKeys(many)).toHaveLength(10);
  });

  it("giocate di altri mercati: gol totali con la linea, doppia chance, entrambe segnano", () => {
    expect(
      parseSelectionKeys([
        "3:TOTAL_GOALS:2.5:OVER",
        "4:DOUBLE_CHANCE::HOME_DRAW",
        "8:BTTS::YES",
        "10:TOTAL_GOALS:4.5:OVER",
        "11:TOTAL_GOALS::OVER",
        "12:BTTS::OVER",
      ]),
    ).toEqual([
      { matchId: 3, market: "TOTAL_GOALS", line: 2.5, selection: "OVER" },
      { matchId: 4, market: "DOUBLE_CHANCE", line: null, selection: "HOME_DRAW" },
      { matchId: 8, market: "BTTS", line: null, selection: "YES" },
    ]);
    expect(selectionKey({ matchId: 3, market: "TOTAL_GOALS", line: 2.5, selection: "OVER" })).toBe(
      "3:TOTAL_GOALS:2.5:OVER",
    );
  });
});
