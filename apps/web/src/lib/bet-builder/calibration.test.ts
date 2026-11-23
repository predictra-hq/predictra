import { describe, expect, it } from "vitest";
import { calibrate, calibrationFrom, MIN_CELL } from "./calibration";

const history = (
  cells: { market: string; from: number; count: number; wins: number; predicted: number }[],
) => calibrationFrom({ marketBands: cells } as never);

describe("correzione storica delle schedine", () => {
  it("abbassa una giocata uscita meno del previsto nella sua fascia", () => {
    // Under 3,5 dato in media al 78% e uscito al 73,9% su 4.288 giocate.
    const cal = history([
      { market: "TOTAL_GOALS:3.5", from: 0.75, count: 4288, wins: 3169, predicted: 4288 * 0.782 },
    ]);
    const p = calibrate(0.78, "TOTAL_GOALS", 3.5, cal);
    expect(p).toBeLessThan(0.75);
    expect(p).toBeGreaterThan(0.73);
  });

  it("alza poco una giocata uscita più del previsto", () => {
    const cal = history([{ market: "1X2", from: 0.6, count: 5000, wins: 3600, predicted: 3200 }]);
    expect(calibrate(0.64, "1X2", null, cal)).toBeCloseTo(0.67, 5);
  });

  it("senza dati sufficienti o sotto il 50% resta uguale", () => {
    const cal = history([
      { market: "BTTS", from: 0.6, count: MIN_CELL - 1, wins: 10, predicted: 120 },
    ]);
    expect(calibrate(0.62, "BTTS", null, cal)).toBe(0.62);
    expect(calibrate(0.45, "BTTS", null, cal)).toBe(0.45);
    expect(calibrate(0.7, "DOUBLE_CHANCE", null, history([]))).toBe(0.7);
  });
});
