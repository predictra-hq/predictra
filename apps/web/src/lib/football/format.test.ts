import { describe, expect, it } from "vitest";
import {
  formatScore,
  freshnessTone,
  healthTone,
  parseCompetitionCode,
  parseId,
  parseMatchday,
  qualityTone,
  sortCompetitions,
} from "./format";

describe("parametri dell'URL", () => {
  it("giornata: intero positivo, 'all' o null", () => {
    expect(parseMatchday("12")).toBe(12);
    expect(parseMatchday(["3", "4"])).toBe(3);
    expect(parseMatchday("all")).toBe("all");
    for (const bad of [undefined, "", "0", "-1", "1.5", "abc", "1234", "1; drop"]) {
      expect(parseMatchday(bad)).toBeNull();
    }
  });

  it("codice competizione: solo maiuscole e cifre", () => {
    expect(parseCompetitionCode("SA")).toBe("SA");
    expect(parseCompetitionCode("BL1")).toBe("BL1");
    expect(parseCompetitionCode("sa")).toBeNull();
    expect(parseCompetitionCode("S")).toBeNull();
    expect(parseCompetitionCode("SA,PL")).toBeNull();
  });

  it("id: intero positivo", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId("0")).toBeNull();
    expect(parseId("4a")).toBeNull();
  });
});

describe("presentazione", () => {
  it("punteggio", () => {
    expect(formatScore(2, 1)).toBe("2 – 1");
    expect(formatScore(null, null)).toBe("–");
    expect(formatScore(0, null)).toBe("–");
  });

  it("toni di qualità, freschezza e salute", () => {
    expect(qualityTone("OK")).toBe("positive");
    expect(qualityTone("WARNING")).toBe("warning");
    expect(qualityTone("ERROR")).toBe("negative");
    expect(freshnessTone("STALE")).toBe("warning");
    expect(freshnessTone(null)).toBe("neutral");
    expect(healthTone("DEGRADED")).toBe("negative");
    expect(healthTone("NO_DATA")).toBe("neutral");
  });

  it("competizioni nell'ordine della v1, poi alfabetico", () => {
    const sorted = sortCompetitions([
      { code: "CL", name: "UEFA Champions League" },
      { code: null, name: "Zeta" },
      { code: "SA", name: "Serie A" },
      { code: "PL", name: "Premier League" },
      { code: null, name: "Alfa" },
    ]);
    expect(sorted.map((c) => c.code ?? c.name)).toEqual(["SA", "PL", "CL", "Alfa", "Zeta"]);
  });
});
