import { describe, expect, it } from "vitest";
import {
  DEFAULT_BET_BUILDER_RULES,
  categoryForProbability,
  expectedValue,
  independentProbability,
  rankScore,
} from "./bet-builder";

describe("Bet Builder: formule di riferimento (ADR 0025–0027)", () => {
  it("EV per unità puntata: p · quota − 1", () => {
    // 0,50 · 2,50 − 1 = 0,25
    expect(expectedValue(0.5, 2.5)).toBeCloseTo(0.25, 12);
    // 0,25 · 3,40 − 1 = −0,15
    expect(expectedValue(0.25, 3.4)).toBeCloseTo(-0.15, 12);
  });

  it("multipla su partite diverse: prodotto delle probabilità", () => {
    // 0,50 · 0,55 = 0,275; quota 2,50 · 2,20 = 5,50; EV = 0,275 · 5,50 − 1 = 0,5125
    const p = independentProbability([0.5, 0.55]);
    expect(p).toBeCloseTo(0.275, 12);
    expect(expectedValue(p, 2.5 * 2.2)).toBeCloseTo(0.5125, 12);
    expect(independentProbability([])).toBe(1);
  });

  it("categorie per probabilità combinata", () => {
    expect(categoryForProbability(0.5)).toBe("CONSERVATIVE");
    expect(categoryForProbability(0.499)).toBe("BALANCED");
    expect(categoryForProbability(0.25)).toBe("BALANCED");
    expect(categoryForProbability(0.249)).toBe("AGGRESSIVE");
  });

  it("ranking: C · EV / σ, con σ = quota · √(p(1 − p))", () => {
    // p = 0,5, quota 2,5, C = 0,6: σ = 2,5 · 0,5 = 1,25; 0,6 · 0,25 / 1,25 = 0,12
    expect(rankScore(0.5, 2.5, 0.6)).toBeCloseTo(0.12, 12);
    // A parità di EV vince la varianza più bassa.
    expect(rankScore(0.5, 2.2, 0.6)).toBeGreaterThan(rankScore(0.2, 5.5, 0.6));
    expect(() => rankScore(1, 2, 0.5)).toThrow(RangeError);
    expect(() => rankScore(0.5, 1, 0.5)).toThrow(RangeError);
  });

  it("soglie iniziali coerenti", () => {
    const r = DEFAULT_BET_BUILDER_RULES;
    expect(r.min_expected_value).toBeGreaterThan(0);
    expect(r.min_leg_expected_value).toBeGreaterThanOrEqual(0);
    expect(r.max_legs).toBeLessThanOrEqual(10);
  });
});
