import { describe, expect, it } from "vitest";
import { AVATAR_COLOR_KEYS } from "@predictra/shared-types";
import { AVATAR_COLOR_BY_KEY, AVATAR_COLORS, avatarColor } from "./avatar";

/** Contrasto WCAG tra due colori esadecimali. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("avatarColor", () => {
  it("dà sempre lo stesso colore allo stesso utente", () => {
    const id = "6f1c2a9e-1b2c-4d5e-8f90-123456789abc";
    expect(avatarColor(id)).toBe(avatarColor(id));
  });

  it("usa più colori su utenti diversi", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `utente-${i}`);
    expect(new Set(ids.map((id) => avatarColor(id))).size).toBe(AVATAR_COLORS.length);
  });

  it("ogni colore si legge con il simbolo bianco (contrasto ≥ 3:1)", () => {
    for (const c of AVATAR_COLORS) expect(contrast(c, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("usa il colore scelto; un valore sconosciuto torna al colore automatico", () => {
    expect(avatarColor("x", "violet")).toBe("#534ab7");
    expect(avatarColor("x", "nero")).toBe(avatarColor("x"));
    expect(Object.keys(AVATAR_COLOR_BY_KEY).sort()).toEqual([...AVATAR_COLOR_KEYS].sort());
    for (const c of Object.values(AVATAR_COLOR_BY_KEY)) expect(AVATAR_COLORS).toContain(c);
  });
});
