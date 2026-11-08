import { describe, expect, it } from "vitest";
import { CONFIDENCE_WEIGHTS, confidenceBand } from "./predictions";

describe("Confidence Score", () => {
  it("fasce: bassa < 0,40 ≤ media < 0,70 ≤ alta", () => {
    expect(confidenceBand(0)).toBe("LOW");
    expect(confidenceBand(0.399)).toBe("LOW");
    expect(confidenceBand(0.4)).toBe("MEDIUM");
    expect(confidenceBand(0.7)).toBe("HIGH");
  });

  it("i pesi sommano a 1", () => {
    const sum = Object.values(CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
  });
});
