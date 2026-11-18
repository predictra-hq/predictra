import { describe, expect, it } from "vitest";
import {
  SOUND_PATTERNS,
  SOUND_VOLUME,
  soundDuration,
  soundsEnabled,
  type SoundKind,
} from "./sounds";

describe("suoni dell'interfaccia", () => {
  it("spenti finché il cookie non li accende", () => {
    expect(soundsEnabled("")).toBe(false);
    expect(soundsEnabled("predictra-sounds=off")).toBe(false);
    expect(soundsEnabled("a=1; predictra-sounds=on")).toBe(true);
  });

  it("ogni suono è breve, con frequenze udibili e non fastidiose", () => {
    for (const kind of Object.keys(SOUND_PATTERNS) as SoundKind[]) {
      expect(soundDuration(kind), kind).toBeLessThanOrEqual(500);
      for (const note of SOUND_PATTERNS[kind]) {
        expect(note.freq).toBeGreaterThanOrEqual(200);
        expect(note.freq).toBeLessThanOrEqual(1200);
      }
    }
  });

  it("volume basso", () => {
    expect(SOUND_VOLUME).toBeLessThanOrEqual(0.1);
  });

  it("fatto sale, errore scende", () => {
    const first = (k: SoundKind) => SOUND_PATTERNS[k][0]!.freq;
    const last = (k: SoundKind) => SOUND_PATTERNS[k].at(-1)!.freq;
    expect(last("success")).toBeGreaterThan(first("success"));
    expect(last("error")).toBeLessThan(first("error"));
  });
});
