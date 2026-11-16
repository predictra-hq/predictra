import { describe, expect, it } from "vitest";
import { betOutcome } from "./outcome";

describe("esito di una giocata", () => {
  it("aperta finché non è chiusa, qualunque sia il profitto", () => {
    expect(betOutcome("OPEN", null)).toBe("open");
    expect(betOutcome("OPEN", 5)).toBe("open");
  });
  it("chiusa: vinta, persa o in pari secondo il profitto", () => {
    expect(betOutcome("WON", "12.50")).toBe("won");
    expect(betOutcome("LOST", -4)).toBe("lost");
    expect(betOutcome("VOID", 0)).toBe("even");
    expect(betOutcome("CASHED_OUT", "-1.20")).toBe("lost");
    expect(betOutcome("VOID", null)).toBe("even");
  });
});
