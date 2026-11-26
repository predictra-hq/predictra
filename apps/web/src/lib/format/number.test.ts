import { describe, expect, it } from "vitest";
import {
  formatDecimal,
  formatEuro,
  formatFairOdds,
  formatOdds,
  formatPercent,
  formatSignedPercent,
  MISSING,
} from "./number";

describe("numeri in italiano", () => {
  it("quote e decimali con virgola e separatore delle migliaia", () => {
    expect(formatOdds(2)).toBe("2,00");
    expect(formatOdds("3.4")).toBe("3,40");
    // In italiano il punto delle migliaia compare da cinque cifre (regole CLDR).
    expect(formatOdds(1234.5)).toBe("1234,50");
    expect(formatOdds(12345.6)).toBe("12.345,60");
    expect(formatDecimal(0.21003, 3)).toBe("0,210");
    expect(formatFairOdds(0.25)).toBe("4,00");
  });

  it("percentuali, anche con segno", () => {
    expect(formatPercent(0.4567)).toBe("45,7%");
    expect(formatPercent(0.5, 0)).toBe("50%");
    expect(formatSignedPercent(0.042)).toBe("+4,2%");
    expect(formatSignedPercent(-0.015)).toBe("−1,5%");
  });

  it("euro", () => {
    expect(formatEuro(12345.5).replace(/\s/g, " ")).toBe("12.345,50 €");
    expect(formatEuro("10")).toMatch(/^10,00\s€$/);
  });

  it("un valore assente o non numerico è sempre «—»", () => {
    for (const v of [null, undefined, "", Number.NaN, "abc"]) {
      expect(formatOdds(v as never)).toBe(MISSING);
      expect(formatPercent(v as never)).toBe(MISSING);
      expect(formatEuro(v as never)).toBe(MISSING);
    }
    expect(formatFairOdds(0)).toBe(MISSING);
  });
});
