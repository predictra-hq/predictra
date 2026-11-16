import { describe, expect, it } from "vitest";
import { normalizeOdds, normalizeStake, withPlay, withStake } from "./stake-box";

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

  it("quota corretta a mano e sito del bankroll sostituiscono quelli proposti", () => {
    expect(normalizeOdds("2,35", 2)).toBe(2.35);
    expect(normalizeOdds("1", 2)).toBe(2);
    expect(normalizeOdds("abc", null)).toBeNull();
    expect(
      withPlay("/tracker?add=1&o=2.10&bk=Altro#bet-event", {
        stake: 10,
        odds: 2.35,
        site: "DEMO sito",
      }),
    ).toBe("/tracker?add=1&o=2.35&bk=DEMO+sito&st=10#bet-event");
  });
});
