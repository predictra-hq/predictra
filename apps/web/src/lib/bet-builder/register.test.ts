import { describe, expect, it } from "vitest";
import type { Bolletta, BollettaPick } from "./bollette";
import { bollettaAdvice, bollettaTrackerHref, pickAdviceBankroll } from "./register";

const pick = (n: number, bookmaker = "DEMO Book"): BollettaPick => ({
  matchId: n,
  kickoffAt: "2026-11-20T19:45:00Z",
  home: `DEMO Casa ${n}`,
  away: `DEMO Ospite ${n}`,
  market: "1X2",
  line: null,
  selection: "HOME",
  probability: 0.7,
  confidence: 0.8,
  modelProbability: 0.72,
  marketProbability: 0.68,
  price: 1.5,
  bookmaker,
  observedAt: "2026-11-19T06:47:00Z",
  edge: 0.05,
});

const bolletta = (picks: BollettaPick[], probability: number, price: number): Bolletta => ({
  profile: "SOLID",
  round: "2026-11-20",
  picks,
  probability,
  oddsObservedAt: "2026-11-19T06:47:00Z",
  price,
  expectedValue: probability * price - 1,
});

const labels = { market: "Multipla", selection: "Solida · 2 selezioni" };

describe("dalla schedina alla giocata (valori DEMO)", () => {
  it("link al Tracker con partite, quota totale, bookmaker unico e puntata", () => {
    const href = bollettaTrackerHref(bolletta([pick(1), pick(2)], 0.49, 2.25), labels, 4);
    const [path, hash] = href.split("#");
    const q = new URL(path!, "https://demo.invalid").searchParams;
    expect(hash).toBe("bet-event");
    expect(q.get("add")).toBe("1");
    expect(q.get("d")).toBe("DEMO Casa 1 – DEMO Ospite 1; DEMO Casa 2 – DEMO Ospite 2");
    expect(q.get("mk")).toBe("Multipla");
    expect(q.get("sel")).toBe("Solida · 2 selezioni");
    expect(q.get("o")).toBe("2.25");
    expect(q.get("bk")).toBe("DEMO Book");
    expect(q.get("st")).toBe("4.00");
  });

  it("bookmaker diversi e nessuna puntata: i due campi restano vuoti", () => {
    const href = bollettaTrackerHref(
      bolletta([pick(1), pick(2, "DEMO Altro")], 0.49, 2.25),
      labels,
      null,
    );
    const q = new URL(href, "https://demo.invalid").searchParams;
    expect(q.has("bk")).toBe(false);
    expect(q.has("st")).toBe(false);
  });

  it("descrizione lunga tagliata a 200 caratteri", () => {
    const many = Array.from({ length: 12 }, (_, i) => pick(i + 1));
    const q = new URL(
      bollettaTrackerHref(bolletta(many, 0.1, 9), labels, null),
      "https://d.invalid",
    ).searchParams;
    expect(q.get("d")!.length).toBe(200);
    expect(q.get("d")!.endsWith("…")).toBe(true);
  });

  it("bankroll di riferimento: il primo reale, altrimenti il primo", () => {
    const sim = { kind: "SIMULATED", name: "DEMO Prova" };
    const real = { kind: "REAL", name: "DEMO Reale" };
    expect(pickAdviceBankroll([sim, real])).toBe(real);
    expect(pickAdviceBankroll([sim])).toBe(sim);
    expect(pickAdviceBankroll([])).toBeNull();
  });

  it("puntata consigliata: Kelly con valore, zero senza valore, rispetto dello stake massimo", () => {
    const bankroll = { name: "DEMO", available: 1000, flatPct: 0.01, limits: null };
    // p·o − 1 = 0,1025 → f* = 0,082 → un quarto = 2,05% → tetto 2% → 20 €.
    const good = bollettaAdvice(bolletta([pick(1), pick(2)], 0.49, 2.25), bankroll);
    expect(good.kelly).toBe(20);
    expect(good.kellyNote).toBeNull();

    const bad = bollettaAdvice(bolletta([pick(1), pick(2)], 0.4, 2.25), bankroll);
    expect(bad.kelly).toBe(0);
    expect(bad.kellyNote).toBe("NON_POSITIVE_EV");

    const capped = bollettaAdvice(bolletta([pick(1), pick(2)], 0.49, 2.25), {
      ...bankroll,
      limits: { max_stake: 5, max_open_bets: null, max_daily_loss: null, max_weekly_loss: null },
    });
    expect(capped.kelly).toBe(5);
    expect(capped.cappedByLimit).toBe(true);
  });
});
