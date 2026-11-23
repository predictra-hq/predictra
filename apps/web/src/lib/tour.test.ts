import { describe, expect, it } from "vitest";
import { cardTop, isTourDone, isTourDoneInSettings, TOUR_STEPS, withTourDone } from "./tour";

describe("tutorial", () => {
  it("riconosce il cookie del tutorial già visto", () => {
    expect(isTourDone("done")).toBe(true);
    expect(isTourDone("no")).toBe(false);
    expect(isTourDone(undefined)).toBe(false);
  });

  it("ha passi con chiavi tutte diverse e inizia senza evidenziare nulla", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    expect(TOUR_STEPS[0]!.selector).toBeNull();
  });

  it("mette la scheda sotto la zona se c'è spazio, altrimenti sopra", () => {
    expect(cardTop({ top: 100, left: 0, width: 50, height: 40 }, 200, 800)).toBe(152);
    expect(cardTop({ top: 740, left: 0, width: 50, height: 50 }, 200, 800)).toBe(528);
    expect(cardTop({ top: 20, left: 0, width: 50, height: 760 }, 200, 800)).toBe(12);
  });

  it("il tutorial visto resta nelle impostazioni personali senza toccare le altre", () => {
    expect(isTourDoneInSettings({ tour_done: true })).toBe(true);
    expect(isTourDoneInSettings({})).toBe(false);
    expect(isTourDoneInSettings(null)).toBe(false);
    expect(withTourDone({ widgets: [1] })).toEqual({ widgets: [1], tour_done: true });
    expect(withTourDone([1])).toEqual({ tour_done: true });
  });
});
