import { describe, expect, it } from "vitest";
import {
  confidenceLabel,
  formatRound,
  parseCategory,
  parseSlateDate,
  roundStartOf,
  selectionLabel,
} from "./format";

describe("formattazione Bet Builder", () => {
  it("etichette degli esiti", () => {
    expect(selectionLabel("HOME", "DEMO A", "DEMO B")).toBe("1 · DEMO A");
    expect(selectionLabel("DRAW", "DEMO A", "DEMO B")).toBe("X · pareggio");
    // ADR 0033: altri mercati con quote reali.
    expect(selectionLabel("HOME_DRAW", "DEMO A", "DEMO B", "DOUBLE_CHANCE", null)).toBe(
      "Doppia chance 1X",
    );
    expect(selectionLabel("OVER", "DEMO A", "DEMO B", "TOTAL_GOALS", "2.50")).toBe(
      "Totale gol Over 2,5",
    );
    expect(selectionLabel("HOME", "DEMO A", "DEMO B", "1X2", null)).toBe("1 · DEMO A");
    expect(selectionLabel("AWAY", "DEMO A", "DEMO B")).toBe("2 · DEMO B");
  });

  it("fasce del Confidence Score", () => {
    expect(confidenceLabel(0.3)).toBe("bassa");
    expect(confidenceLabel(0.5)).toBe("media");
    expect(confidenceLabel(0.8)).toBe("alta");
  });

  it("filtri dall'URL", () => {
    expect(parseCategory("BALANCED")).toBe("BALANCED");
    expect(parseCategory("SAFE")).toBeNull();
    expect(parseSlateDate("2026-11-21")).toBe("2026-11-21");
    expect(parseSlateDate("21/11/2026")).toBeNull();
    expect(parseSlateDate(["2026-11-21"])).toBeNull();
  });
});

describe("turni (ADR 0036)", () => {
  it("venerdì–lunedì e martedì–giovedì", () => {
    expect(roundStartOf("2026-11-20")).toBe("2026-11-20");
    expect(roundStartOf("2026-11-22")).toBe("2026-11-20");
    expect(roundStartOf("2026-11-23")).toBe("2026-11-20");
    expect(roundStartOf("2026-11-24")).toBe("2026-11-24");
    expect(roundStartOf("2026-11-26")).toBe("2026-11-24");
  });
  it("etichetta leggibile", () => {
    expect(formatRound("2026-11-20")).toBe("venerdì 20 – lunedì 23 novembre");
    expect(formatRound("2026-10-30")).toBe("venerdì 30 ottobre – lunedì 2 novembre");
    expect(formatRound("2026-11-24")).toBe("martedì 24 – giovedì 26 novembre");
  });
});
