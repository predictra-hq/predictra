import { describe, expect, it } from "vitest";
import {
  confidenceLabel,
  parseCategory,
  parseSlateDate,
  parseStake,
  selectionLabel,
  stakeOutcome,
} from "./format";

describe("formattazione Bet Builder", () => {
  it("etichette degli esiti", () => {
    expect(selectionLabel("HOME", "DEMO A", "DEMO B")).toBe("1 · DEMO A");
    expect(selectionLabel("DRAW", "DEMO A", "DEMO B")).toBe("X · pareggio");
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

  it("puntata dall'URL", () => {
    expect(parseStake("4")).toBe(4);
    expect(parseStake("4,50")).toBe(4.5);
    expect(parseStake("4.5")).toBe(4.5);
    expect(parseStake("0")).toBeNull();
    expect(parseStake("-4")).toBeNull();
    expect(parseStake("4,555")).toBeNull();
    expect(parseStake("quattro")).toBeNull();
    expect(parseStake("1000000")).toBeNull();
    expect(parseStake(undefined)).toBeNull();
  });

  it("esito di una puntata", () => {
    const o = stakeOutcome(4, 7.8, 0.18);
    expect(o.payout).toBe(31.2);
    expect(o.profit).toBe(27.2);
    expect(o.loseProbability).toBeCloseTo(0.82);
  });
});
