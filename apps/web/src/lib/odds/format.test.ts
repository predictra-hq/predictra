import type { MatchOddsH2hRow } from "@predictra/shared-types";
import { describe, expect, it } from "vitest";
import {
  analyseH2h,
  formatDecimal,
  formatOdds,
  formatPercent,
  formatSigned,
  fillTemplate,
  freshnessAt,
  groupOddsByEvent,
  marginTone,
  parsePgInterval,
} from "./format";

/*
 * Le quote dei test sono quelle dell'esempio documentato nell'ADR 0016
 * (2,00 / 3,40 / 4,00), non dati reali.
 */

describe("formattazione", () => {
  it("segnaposto dei testi", () => {
    expect(fillTemplate("{fresh} di {total} aggiornati", { fresh: 3, total: 27 })).toBe(
      "3 di 27 aggiornati",
    );
    expect(fillTemplate("dopo {hours} ore ({x})", { hours: 12 })).toBe("dopo 12 ore ({x})");
  });

  it("quote con due decimali e virgola", () => {
    expect(formatOdds(2)).toBe("2,00");
    expect(formatOdds(3.4)).toBe("3,40");
    expect(formatOdds(12.345)).toBe("12,35");
    expect(formatOdds(null)).toBe("—");
    expect(formatOdds(Number.NaN)).toBe("—");
  });

  it("percentuali", () => {
    expect(formatPercent(0.044118)).toBe("4,4%");
    expect(formatPercent(0.478873, 1)).toBe("47,9%");
    expect(formatPercent(0.5, 0)).toBe("50%");
    expect(formatPercent(undefined)).toBe("—");
  });

  it("decimali e differenze con segno", () => {
    expect(formatDecimal(1.4567)).toBe("1,46");
    expect(formatDecimal(null)).toBe("—");
    expect(formatSigned(0.31)).toBe("+0,31");
    expect(formatSigned(-0.2)).toBe("-0,20");
    expect(formatSigned(0)).toBe("0,00");
  });
});

describe("intervalli di Postgres", () => {
  it("riconosce le forme restituite da PostgREST", () => {
    const h = 3_600_000;
    expect(parsePgInterval("12:00:00")).toBe(12 * h);
    expect(parsePgInterval("06:30:00")).toBe(6.5 * h);
    expect(parsePgInterval("1 day")).toBe(24 * h);
    expect(parsePgInterval("30 days")).toBe(720 * h);
    expect(parsePgInterval("1 day 06:00:00")).toBe(30 * h);
  });

  it("null se assente o non riconosciuto", () => {
    expect(parsePgInterval(null)).toBeNull();
    expect(parsePgInterval("")).toBeNull();
    expect(parsePgInterval("PT12H")).toBeNull();
    expect(parsePgInterval("2 mons")).toBeNull();
  });
});

describe("freschezza (FRESH/STALE)", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const twelveHours = 12 * 3_600_000;

  it("FRESH entro la soglia, STALE oltre", () => {
    expect(freshnessAt("2026-11-08T07:23:00Z", twelveHours, now)).toBe("FRESH");
    expect(freshnessAt("2026-11-08T00:00:00Z", twelveHours, now)).toBe("FRESH");
    expect(freshnessAt("2026-11-07T23:59:59Z", twelveHours, now)).toBe("STALE");
  });

  it("senza soglia è FRESH, senza osservazione è null", () => {
    expect(freshnessAt("2020-01-01T00:00:00Z", null, now)).toBe("FRESH");
    expect(freshnessAt(null, twelveHours, now)).toBeNull();
    expect(freshnessAt("non una data", twelveHours, now)).toBeNull();
  });
});

describe("margine e probabilità implicite", () => {
  const example = {
    home_price: 2,
    draw_price: 3.4,
    away_price: 4,
    home_probability: 0.478873,
    draw_probability: 0.28169,
    away_probability: 0.239437,
  };

  it("overround dell'esempio ADR 0016 (4,41%)", () => {
    const a = analyseH2h(example)!;
    expect(a.overround).toBeCloseTo(0.044118, 6);
    expect(a.proportional).toEqual({ home: 0.478873, draw: 0.28169, away: 0.239437 });
  });

  it("metodo della potenza: somma 1 e più margine sugli esiti meno probabili", () => {
    const a = analyseH2h(example)!;
    const p = a.power!;
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 9);
    // Rispetto al proporzionale il favorito guadagna, l'esito meno probabile perde.
    expect(p.home).toBeGreaterThan(a.proportional.home);
    expect(p.away).toBeLessThan(a.proportional.away);
  });

  it("quote non valide: nessun calcolo", () => {
    expect(analyseH2h({ ...example, draw_price: 1 })).toBeNull();
    expect(analyseH2h({ ...example, away_price: Number.NaN })).toBeNull();
  });

  it("tono del margine", () => {
    expect(marginTone(0.03)).toBe("positive");
    expect(marginTone(0.07)).toBe("neutral");
    expect(marginTone(0.12)).toBe("warning");
  });
});

describe("raggruppamento per evento", () => {
  const base: MatchOddsH2hRow = {
    event_id: 1,
    match_id: 10,
    competition_id: 1,
    commence_time: "2026-11-09T19:45:00+00:00",
    home_team_name: "Squadra Casa (test)",
    away_team_name: "Squadra Ospite (test)",
    bookmaker: "ref_b",
    bookmaker_title: "Riferimento B",
    italian_market: false,
    home_price: 2,
    draw_price: 3.4,
    away_price: 4,
    overround: 0.044118,
    home_probability: 0.478873,
    draw_probability: 0.28169,
    away_probability: 0.239437,
    provider: "the-odds-api",
    observed_at: "2026-11-08T07:23:00+00:00",
    event_time: "2026-11-08T07:20:00+00:00",
    quality: "OK",
    freshness: "STALE",
  };

  it("separa versioni italiane e riferimento, ordina per nome e per calcio d'inizio", () => {
    const rows: MatchOddsH2hRow[] = [
      { ...base, event_id: 2, commence_time: "2026-11-10T19:45:00+00:00" },
      base,
      {
        ...base,
        bookmaker: "it_b",
        bookmaker_title: "Italiano B",
        italian_market: true,
        freshness: "FRESH",
        observed_at: "2026-11-08T16:37:00+00:00",
      },
      { ...base, bookmaker: "it_a", bookmaker_title: "Italiano A", italian_market: true },
      { ...base, bookmaker: "ref_a", bookmaker_title: "Riferimento A" },
    ];
    const groups = groupOddsByEvent(rows);
    expect(groups.map((g) => g.eventId)).toEqual([1, 2]);
    const first = groups[0]!;
    expect(first.italian.map((r) => r.bookmaker)).toEqual(["it_a", "it_b"]);
    expect(first.reference.map((r) => r.bookmaker)).toEqual(["ref_a", "ref_b"]);
    expect(first.freshness).toBe("FRESH");
    expect(first.freshBookmakers).toBe(1);
    expect(first.lastObservedAt).toBe("2026-11-08T16:37:00+00:00");
    expect(groups[1]!.freshness).toBe("STALE");
    expect(groups[1]!.freshBookmakers).toBe(0);
  });

  it("nessuna riga, nessun evento", () => {
    expect(groupOddsByEvent([])).toEqual([]);
  });
});
