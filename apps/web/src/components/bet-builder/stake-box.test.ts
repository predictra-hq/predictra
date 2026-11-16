import { describe, expect, it } from "vitest";
import { normalizeStake, withStake } from "./stake-box";

describe("puntata modificabile", () => {
  it("euro interi, con un valore di riserva se il campo non è valido", () => {
    expect(normalizeStake("10", 2)).toBe(10);
    expect(normalizeStake("7,9", 2)).toBe(7);
    expect(normalizeStake("", 2)).toBe(2);
    expect(normalizeStake("0", 2)).toBe(2);
  });

  it("aggiunge la puntata al link prima dell'ancora", () => {
    expect(withStake("/tracker?add=1&o=2.10#bet-event", 10)).toBe(
      "/tracker?add=1&o=2.10&st=10#bet-event",
    );
    expect(withStake("/tracker", 5)).toBe("/tracker?st=5");
  });
});
