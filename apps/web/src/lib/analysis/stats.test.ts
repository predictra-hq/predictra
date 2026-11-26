import { describe, expect, it } from "vitest";
import {
  calibrationTest,
  clusteredBootstrap,
  linkedGroups,
  pairedBrier,
  quantile,
  seededRandom,
} from "./stats";

describe("statistiche dell'analisi delle schedine", () => {
  it("il generatore con seme ripete la stessa sequenza", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("schedine con una partita in comune finiscono nello stesso gruppo", () => {
    // 0 e 1 condividono la partita 2; 1 e 2 la partita 3; la 3 è da sola.
    expect(linkedGroups([["1", "2"], ["2", "3"], ["3"], ["9"]])).toEqual([0, 0, 0, 1]);
  });

  it("l'intervallo a gruppi è più largo quando le schedine sono collegate", () => {
    // 40 schedine: 20 vinte (+1) e 20 perse (−1).
    const values = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const independent = clusteredBootstrap(values.map((value, i) => ({ keys: [`m${i}`], value })));
    // Le stesse, ma a coppie che condividono una partita e hanno lo stesso esito.
    const linked = clusteredBootstrap(
      values.map((_, i) => ({ keys: [`m${Math.floor(i / 2)}`], value: i % 4 < 2 ? 1 : -1 })),
    );
    expect(independent!.groups).toBe(40);
    expect(linked!.groups).toBe(20);
    expect(independent!.mean).toBe(0);
    expect(linked!.mean).toBe(0);
    expect(linked!.high - linked!.low).toBeGreaterThan(independent!.high - independent!.low);
    expect(clusteredBootstrap([])).toBeNull();
  });

  it("calibrazione: uscite in linea con le probabilità danno z vicino a zero", () => {
    const legs = Array.from({ length: 100 }, (_, i) => ({ probability: 0.7, won: i < 70 }));
    expect(calibrationTest(legs)).toMatchObject({ n: 100, observed: 70 });
    expect(calibrationTest(legs)!.z).toBeCloseTo(0, 10);
    // Date al 70% ma uscite la metà delle volte: z molto negativo.
    const over = Array.from({ length: 100 }, (_, i) => ({ probability: 0.7, won: i < 50 }));
    expect(calibrationTest(over)!.z).toBeLessThan(-4);
  });

  it("confronto appaiato: la probabilità più vicina all'esito ha Brier più basso", () => {
    const legs = [
      { a: 0.9, b: 0.6, won: true },
      { a: 0.2, b: 0.5, won: false },
      { a: 0.8, b: 0.7, won: true },
    ];
    const r = pairedBrier(legs)!;
    expect(r.n).toBe(3);
    expect(r.difference).toBeLessThan(0);
    expect(r.standardError).toBeGreaterThan(0);
    expect(pairedBrier([legs[0]!])).toBeNull();
  });

  it("quantili", () => {
    expect(quantile([3, 1, 2, 4], 0.5)).toBe(2.5);
    expect(quantile([5], 0.9)).toBe(5);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });
});
