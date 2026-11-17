/**
 * Contrasti del tema (M8, B1, WCAG 2.1 AA): letti da globals.css, così un cambio di
 * colore che peggiora la leggibilità fa fallire i test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

const LIGHT_START = css.indexOf(':root[data-theme="light"] {');
if (LIGHT_START === -1) throw new Error("tema chiaro non trovato in globals.css");
const SOURCES = { dark: css.slice(0, LIGHT_START), light: css.slice(LIGHT_START) } as const;
type ThemeName = keyof typeof SOURCES;
let current: ThemeName = "dark";

function token(name: string): [number, number, number] {
  const hex = SOURCES[current].match(new RegExp(`--color-${name}: *(#[0-9a-f]{6});`, "i"))?.[1];
  if (!hex) throw new Error(`colore --color-${name} non trovato`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const BACKGROUNDS = ["bg", "surface", "surface-2"];

describe.each(["dark", "light"] as const)("contrasti del tema %s", (theme) => {
  beforeEach(() => {
    current = theme;
  });

  it.each([
    "fg",
    "muted",
    "subtle",
    "positive",
    "positive-strong",
    "negative",
    "negative-strong",
    "warning",
    "info",
    "name-green",
    "name-teal",
    "name-blue",
    "name-violet",
    "name-pink",
    "name-orange",
    "name-amber",
    "name-red",
  ])("testo %s ≥ 4.5:1 su tutti gli sfondi", (text) => {
    for (const bg of BACKGROUNDS) {
      expect(contrast(token(text), token(bg)), `${text} su ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("bordo dei campi ≥ 3:1 (componenti dell'interfaccia)", () => {
    for (const bg of BACKGROUNDS) {
      expect(contrast(token("input"), token(bg)), `input su ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("testo sul pulsante principale ≥ 4.5:1", () => {
    expect(contrast(token("on-positive"), token("positive"))).toBeGreaterThanOrEqual(4.5);
  });
});
