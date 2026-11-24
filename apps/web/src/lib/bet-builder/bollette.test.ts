import { describe, expect, it } from "vitest";
import {
  buildBollette,
  marketConsensus,
  oddsAreOld,
  playablePicks,
  roundOfKickoff,
} from "./bollette";
import { bestItalianPrices, type LatestOddsRow, type LikelyRow } from "./likely";

// Sabato 21 e domenica 22 novembre 2026: stesso turno (venerdì 20 – lunedì 23).
const row = (
  match: number,
  market: string,
  selection: string,
  probability: number,
  line: number | null = null,
  confidence = 0.8,
): LikelyRow => ({
  match_id: match,
  kickoff_at: `2026-11-2${match % 2 === 0 ? 2 : 1}T1${match}:00:00Z`,
  home_team_name: `DEMO Casa ${match}`,
  away_team_name: `DEMO Ospite ${match}`,
  market,
  line,
  selection,
  probability,
  confidence_score: confidence,
});

const odds = (
  match: number,
  market: string,
  selection: string,
  price: number,
  bookmaker = "DEMO (IT)",
  italian = true,
): LatestOddsRow => ({
  match_id: match,
  bookmaker,
  market,
  selection,
  price,
  observed_at: "2026-11-20T08:00:00Z",
  italian,
});

describe("consenso di mercato (valori DEMO)", () => {
  it("probabilità senza margine per bookmaker, media tra i bookmaker", () => {
    const c = marketConsensus([
      // Bookmaker A: 1/2 + 1/4 + 1/4 = 1 (nessun margine).
      odds(1, "h2h", "HOME", 2, "A"),
      odds(1, "h2h", "DRAW", 4, "A"),
      odds(1, "h2h", "AWAY", 4, "A"),
      // Bookmaker B: con margine, normalizzato.
      odds(1, "h2h", "HOME", 1.8, "B"),
      odds(1, "h2h", "DRAW", 3.6, "B"),
      odds(1, "h2h", "AWAY", 3.6, "B"),
      odds(1, "totals_2_5", "OVER", 1.9, "A"),
      odds(1, "totals_2_5", "UNDER", 1.9, "A"),
      // Mercato incompleto: ignorato.
      odds(2, "h2h", "HOME", 1.5, "A"),
    ]);
    expect(c.get("1|h2h|HOME")).toBeCloseTo(0.5);
    expect(c.get("1|h2h|DRAW")).toBeCloseTo(0.25);
    expect(c.get("1|totals_2_5|OVER")).toBeCloseTo(0.5);
    // Doppia chance dal consenso 1X2 (ADR 0033).
    expect(c.get("1|double_chance|HOME_DRAW")).toBeCloseTo(0.75);
    expect(c.has("2|h2h|HOME")).toBe(false);
  });

  it("le quote non italiane contano per il mercato ma non sono giocabili", () => {
    const rows = [odds(1, "h2h", "HOME", 2.5, "Estero", false), odds(1, "h2h", "HOME", 2.1)];
    expect(bestItalianPrices(rows).get("1|h2h|HOME")?.price).toBe(2.1);
  });
});

describe("schedine consigliate (valori DEMO)", () => {
  it("turno dal calcio d'inizio nel fuso di Roma", () => {
    expect(roundOfKickoff("2026-11-21T18:00:00Z")).toBe("2026-11-20");
    expect(roundOfKickoff("2026-11-23T20:00:00Z")).toBe("2026-11-20");
    // Lunedì alle 23:30 UTC è già martedì a Roma: turno infrasettimanale.
    expect(roundOfKickoff("2026-11-23T23:30:00Z")).toBe("2026-11-24");
  });

  it("solo selezioni con quota italiana reale e valore credibile", () => {
    const prices = bestItalianPrices([
      odds(1, "h2h", "HOME", 1.7), // 0,60 × 1,70: valore +2%
      odds(2, "h2h", "HOME", 3.0), // 0,60 × 3,00: +80%, non credibile
      odds(3, "h2h", "HOME", 1.55), // 0,60 × 1,55: −7%, paga meno del giusto
      odds(5, "h2h", "HOME", 1.7),
    ]);
    const picks = playablePicks(
      [
        row(1, "1X2", "HOME", 0.6),
        row(2, "1X2", "HOME", 0.6),
        row(3, "1X2", "HOME", 0.6),
        row(4, "BTTS", "YES", 0.7), // nessuna quota italiana per gol/no gol
        row(5, "1X2", "HOME", 0.6, null, 0.3), // affidabilità bassa
      ],
      prices,
    );
    expect(picks.map((p) => p.matchId)).toEqual([1]);
    expect(picks[0]!.edge).toBeCloseTo(0.02);
    expect(picks[0]!.bookmaker).toBe("DEMO (IT)");
  });

  it("probabilità prudente: media tra modello e mercato", () => {
    const prices = bestItalianPrices([odds(1, "h2h", "HOME", 1.9)]);
    const consensus = new Map([["1|h2h|HOME", 0.5]]);
    const [pick] = playablePicks([row(1, "1X2", "HOME", 0.6)], prices, consensus);
    expect(pick!.modelProbability).toBe(0.6);
    expect(pick!.marketProbability).toBe(0.5);
    expect(pick!.probability).toBeCloseTo(0.55);
    expect(pick!.edge).toBeCloseTo(0.55 * 1.9 - 1);
  });

  it("per ogni partita prima la precisione, poi il valore (ADR 0065)", () => {
    const rows = [
      // Partita 1: doppia chance all'80% a quota giusta, 1 al 66% con valore: vince la
      // prima (0,80 + 0 contro 0,66 + 0,056).
      row(1, "DOUBLE_CHANCE", "HOME_DRAW", 0.8),
      row(1, "1X2", "HOME", 0.66),
      row(3, "1X2", "HOME", 0.68),
      row(2, "TOTAL_GOALS", "OVER", 0.7, 1.5),
    ];
    const prices = bestItalianPrices([
      odds(1, "double_chance", "HOME_DRAW", 1.25), // valore 0
      odds(1, "h2h", "HOME", 1.6), // valore +5,6%
      odds(3, "h2h", "HOME", 1.5), // +2%
      odds(2, "totals_1_5", "OVER", 1.4), // −2%
    ]);
    // Regola «di valore» (ADR 0070): giocate almeno alla quota giusta.
    const rule = { minProbability: 0.65, minPrice: 1.25, legs: 3 };
    const rules = { DOUBLE: rule, SOLID: rule, BALANCED: rule, HIGH: rule };
    const [solid] = buildBollette(rows, prices, new Map(), new Map(), { rules });
    expect(solid!.profile).toBe("DOUBLE");
    // L'over 1,5 (−2%) è sotto la quota giusta: resta fuori.
    expect(solid!.picks.map((p) => [p.matchId, p.market])).toEqual([
      [1, "DOUBLE_CHANCE"],
      [3, "1X2"],
    ]);
    expect(solid!.price).toBeCloseTo(1.25 * 1.5);
    expect(solid!.probability).toBeCloseTo(0.8 * 0.68);
    expect(solid!.expectedValue).toBeCloseTo(solid!.probability * solid!.price - 1);
    // Quote lette alle 08:00 del 20/11: aggiornate fino a 12 ore dopo, poi da ricontrollare.
    expect(solid!.oddsObservedAt).toBe("2026-11-20T08:00:00Z");
    expect(oddsAreOld(solid!, new Date("2026-11-20T19:00:00Z"))).toBe(false);
    expect(oddsAreOld(solid!, new Date("2026-11-21T09:00:00Z"))).toBe(true);
  });

  it("nessuna schedina forzata e nessun doppione tra profili; squadre tutte diverse", () => {
    const rows = [
      row(1, "1X2", "HOME", 0.7),
      row(3, "1X2", "HOME", 0.66),
      // Stessa squadra di casa della partita 1: non può stare nella stessa schedina.
      { ...row(5, "1X2", "HOME", 0.69), home_team_name: "DEMO Casa 1" },
    ];
    const prices = bestItalianPrices([
      odds(1, "h2h", "HOME", 1.5),
      odds(3, "h2h", "HOME", 1.55),
      odds(5, "h2h", "HOME", 1.5),
    ]);
    const bollette = buildBollette(rows, prices);
    // Solida ed Equilibrata sceglierebbero le stesse due partite: ne resta una sola.
    expect(bollette).toHaveLength(1);
    expect(bollette[0]!.picks.map((p) => p.matchId).sort()).toEqual([1, 3]);
    // Una sola selezione valida: nessuna schedina.
    expect(buildBollette([row(1, "1X2", "HOME", 0.7)], prices)).toEqual([]);
  });
});

describe("una schedina consigliata non perde in media (valori DEMO)", () => {
  it("profili di valore: solo giocate almeno alla quota giusta (ADR 0070)", () => {
    const rule = { minProbability: 0.65, minPrice: 1.25, legs: 3 };
    const rules = { DOUBLE: rule, SOLID: rule, BALANCED: rule, HIGH: rule };
    // Probabilità 0,70: a quota 1,50 il valore è +5%, a 1,40 è −2%.
    const rows = [1, 3, 5].map((m) => row(m, "1X2", "HOME", 0.7));
    const good = buildBollette(
      rows,
      bestItalianPrices([odds(1, "h2h", "HOME", 1.5), odds(3, "h2h", "HOME", 1.5)]),
      new Map(),
      new Map(),
      { rules },
    );
    expect(good.length).toBeGreaterThan(0);
    expect(good.every((b) => b.expectedValue >= 0)).toBe(true);
    // Una conveniente e due sotto la quota giusta: da sola non fa una schedina.
    const mixed = buildBollette(
      rows,
      bestItalianPrices([
        odds(1, "h2h", "HOME", 1.5),
        odds(3, "h2h", "HOME", 1.4),
        odds(5, "h2h", "HOME", 1.4),
      ]),
      new Map(),
      new Map(),
      { rules },
    );
    expect(mixed).toEqual([]);
  });

  it("profili di precisione: le giocate più probabili, anche un po' sotto la quota giusta", () => {
    // Doppia: due giocate dall'80%; la più probabile prima, anche con valore −2%.
    const rows = [
      row(1, "DOUBLE_CHANCE", "HOME_DRAW", 0.86),
      row(3, "DOUBLE_CHANCE", "HOME_DRAW", 0.82),
      row(5, "DOUBLE_CHANCE", "HOME_DRAW", 0.81),
    ];
    const bollette = buildBollette(
      rows,
      bestItalianPrices([
        odds(1, "double_chance", "HOME_DRAW", 1.14), // −2%
        odds(3, "double_chance", "HOME_DRAW", 1.25), // +2,5%
        odds(5, "double_chance", "HOME_DRAW", 1.24), // +0,4%
      ]),
    );
    const double = bollette.find((b) => b.profile === "DOUBLE")!;
    expect(double.picks.map((p) => p.matchId)).toEqual([1, 3]);
    expect(double.expectedValue).toBeGreaterThan(-0.05);
  });

  it("solo selezioni che non convengono: nessuna schedina", () => {
    const rows = [1, 3].map((m) => row(m, "1X2", "HOME", 0.7));
    const prices = bestItalianPrices([odds(1, "h2h", "HOME", 1.4), odds(3, "h2h", "HOME", 1.4)]);
    expect(buildBollette(rows, prices)).toEqual([]);
  });
  it("scarta le giocate su cui modello e mercato non sono d'accordo (ADR 0065)", () => {
    const rows = [row(1, "1X2", "HOME", 0.8)];
    const prices = bestItalianPrices([odds(1, "h2h", "HOME", 1.4)]);
    // Mercato al 60%: 20 punti dal modello, troppi.
    const far = new Map([["1|h2h|HOME", 0.6]]);
    expect(playablePicks(rows, prices, far)).toEqual([]);
    const near = new Map([["1|h2h|HOME", 0.72]]);
    expect(playablePicks(rows, prices, near)).toHaveLength(1);
  });

  it("corregge la probabilità con la verifica storica del mercato", () => {
    const rows = [row(1, "1X2", "HOME", 0.66)];
    const prices = bestItalianPrices([odds(1, "h2h", "HOME", 1.75)]);
    // Data in media al 65%, uscita al 56%: la correzione arriva al massimo (8 punti).
    const calibration = new Map([["1X2|0.6", { count: 1000, wins: 560, predicted: 650 }]]);
    const [pick] = playablePicks(rows, prices, new Map(), 0.5, calibration);
    expect(pick!.modelProbability).toBeCloseTo(0.58, 6);
  });
});

describe("periodo delle schedine (ADR 0070)", () => {
  it("turno oppure giornata, nel fuso di Roma", async () => {
    const { windowOf } = await import("./bollette");
    // Sabato 21/11 alle 15 italiane: turno da venerdì 20.
    expect(windowOf("2026-11-21T14:00:00Z", "round")).toBe("2026-11-20");
    expect(windowOf("2026-11-21T14:00:00Z", "day")).toBe("2026-11-21");
    // Mezzanotte passata a Roma: già il giorno dopo.
    expect(windowOf("2026-11-21T23:30:00Z", "day")).toBe("2026-11-22");
  });
});
