import { describe, expect, it } from "vitest";
import { readAccountSettings, withAccountSettings } from "./account-settings";

describe("preferenze salvate nell'account", () => {
  it("legge solo valori validi", () => {
    expect(readAccountSettings({ theme: "light", sounds: false, alert_threshold: 90 })).toEqual({
      theme: "light",
      sounds: false,
      alertThreshold: 90,
    });
    expect(readAccountSettings({ theme: "rosa", sounds: "no", alert_threshold: 50 })).toEqual({});
    expect(readAccountSettings(null)).toEqual({});
  });

  it("aggiorna senza toccare le altre chiavi", () => {
    expect(withAccountSettings({ tour_done: true, theme: "dark" }, { theme: "light" })).toEqual({
      tour_done: true,
      theme: "light",
    });
    expect(withAccountSettings([1], { sounds: true })).toEqual({ sounds: true });
  });
});
