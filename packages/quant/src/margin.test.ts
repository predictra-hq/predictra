import { describe, expect, it } from "vitest";
import {
  demargin,
  expectedValue,
  fairOdds,
  impliedProbabilities,
  InvalidOddsError,
  overround,
  powerProbabilities,
  proportionalProbabilities,
  shinProbabilities,
} from "./margin";

/*
 * Casi calcolati a mano (ADR 0016).
 *
 * Caso A — quote 2,00 / 3,40 / 4,00:
 *   1/o = 0,5 · 0,2941176 · 0,25 → somma 1,0441176 → overround 4,41%
 *   proporzionale = 0,4788732 · 0,2816901 · 0,2394366
 *
 * Caso B — quote eque 2 / 4 / 4: somma 1, nessun margine; ogni metodo
 *   restituisce 0,5 · 0,25 · 0,25.
 *
 * Caso C — mercato a due esiti 1,90 / 1,90: 1/1,9 = 0,5263158 → somma 1,0526316
 *   → overround 5,26%; per simmetria entrambi i metodi danno 0,5 · 0,5.
 */

const close = (actual: number[], expected: number[], digits = 6) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, digits));
};

describe("probabilità implicite e margine", () => {
  it("caso A", () => {
    close(impliedProbabilities([2, 3.4, 4]), [0.5, 0.2941176, 0.25]);
    expect(overround([2, 3.4, 4])).toBeCloseTo(0.0441176, 6);
    close(proportionalProbabilities([2, 3.4, 4]), [0.4788732, 0.2816901, 0.2394366]);
  });

  it("caso B: quote eque", () => {
    expect(overround([2, 4, 4])).toBeCloseTo(0, 12);
    close(proportionalProbabilities([2, 4, 4]), [0.5, 0.25, 0.25], 10);
    close(powerProbabilities([2, 4, 4]), [0.5, 0.25, 0.25], 8);
  });

  it("caso C: due esiti simmetrici", () => {
    expect(overround([1.9, 1.9])).toBeCloseTo(0.0526316, 6);
    close(demargin([1.9, 1.9], "proportional"), [0.5, 0.5]);
    close(demargin([1.9, 1.9], "power"), [0.5, 0.5]);
  });

  it("il metodo della potenza somma a 1 e toglie più margine allo sfavorito", () => {
    const odds = [1.5, 4.2, 6.5];
    const prop = proportionalProbabilities(odds);
    const pow = powerProbabilities(odds);
    expect(pow.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    // Favorito: probabilità più alta col metodo della potenza; sfavorito: più bassa.
    expect(pow[0]!).toBeGreaterThan(prop[0]!);
    expect(pow[2]!).toBeLessThan(prop[2]!);
  });

  it("il metodo di Shin somma a 1, toglie più margine allo sfavorito e senza margine non cambia nulla", () => {
    const odds = [1.5, 4.2, 6.5];
    const prop = proportionalProbabilities(odds);
    const shin = shinProbabilities(odds);
    expect(shin.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(shin[0]!).toBeGreaterThan(prop[0]!);
    expect(shin[2]!).toBeLessThan(prop[2]!);
    expect(demargin(odds, "shin")).toEqual(shin);
    // Quote eque (somma delle implicite = 1): uguali alle implicite.
    const fair = shinProbabilities([2, 4, 4]);
    expect(fair[0]).toBeCloseTo(0.5, 10);
    expect(fair[1]).toBeCloseTo(0.25, 10);
  });

  it("rifiuta quote non valide", () => {
    for (const bad of [[2], [1, 3], [2, -110], [2, Number.NaN], [2, Infinity]]) {
      expect(() => overround(bad)).toThrow(InvalidOddsError);
    }
  });
});

describe("quota equa e valore atteso", () => {
  it("quota equa = 1/p", () => {
    expect(fairOdds(0.25)).toBe(4);
    expect(() => fairOdds(0)).toThrow(InvalidOddsError);
  });

  it("EV = p · o − 1", () => {
    expect(expectedValue(0.5, 2.2)).toBeCloseTo(0.1, 12);
    expect(expectedValue(0.4, 2.2)).toBeCloseTo(-0.12, 12);
    expect(() => expectedValue(1.2, 2)).toThrow(InvalidOddsError);
  });
});
