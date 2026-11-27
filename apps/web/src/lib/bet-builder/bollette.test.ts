import { describe, expect, it } from "vitest";
import {
  buildBollette,
  exhaustiveLegs,
  freshOdds,
  hasPositiveValue,
  marketConsensus,
  notStartingSoon,
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

  it("probabilità prudente: media pesata tra modello e mercato", () => {
    const prices = bestItalianPrices([odds(1, "h2h", "HOME", 1.9)]);
    const consensus = new Map([["1|h2h|HOME", 0.5]]);
    const [pick] = playablePicks([row(1, "1X2", "HOME", 0.6)], prices, consensus);
    expect(pick!.modelProbability).toBe(0.6);
    expect(pick!.marketProbability).toBe(0.5);
    // Peso del mercato 0,75 (ADR 0071): 0,25 × 0,6 + 0,75 × 0,5.
    expect(pick!.probability).toBeCloseTo(0.525);
    expect(pick!.edge).toBeCloseTo(0.525 * 1.9 - 1);
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
    const rules = { SOLID: rule, BALANCED: rule, HIGH: rule };
    const [solid] = buildBollette(rows, prices, new Map(), new Map(), { rules });
    expect(solid!.profile).toBe("SOLID");
    // L'over 1,5 (−2%) è sotto la quota giusta: resta fuori.
    expect(solid!.picks.map((p) => [p.matchId, p.market])).toEqual([
      [1, "DOUBLE_CHANCE"],
      [3, "1X2"],
    ]);
    expect(solid!.price).toBeCloseTo(1.25 * 1.5);
    expect(solid!.probability).toBeCloseTo(0.8 * 0.68);
    expect(solid!.expectedValue).toBeCloseTo(solid!.probability * solid!.price - 1);
    // Quote lette alle 08:00 del 20/11: aggiornate fino a 26 ore dopo, poi da ricontrollare.
    expect(solid!.oddsObservedAt).toBe("2026-11-20T08:00:00Z");
    expect(oddsAreOld(solid!, new Date("2026-11-21T09:00:00Z"))).toBe(false);
    expect(oddsAreOld(solid!, new Date("2026-11-21T11:00:00Z"))).toBe(true);
  });

  it("nessuna schedina sotto la quota minima; squadre tutte diverse (ADR 0072)", () => {
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
      odds(7, "h2h", "HOME", 1.5),
    ]);
    // Solo due partite utili: quota 2,33, sotto il minimo della Solida (3). Nessuna schedina.
    expect(buildBollette(rows, prices)).toEqual([]);
    // Con una terza partita la Solida arriva a 3,49; le altre non hanno giocate da 1,70.
    const bollette = buildBollette([...rows, row(7, "1X2", "HOME", 0.68)], prices);
    expect(bollette.map((b) => b.profile)).toEqual(["SOLID"]);
    expect(bollette[0]!.picks.map((p) => p.matchId)).toEqual([1, 3, 7]);
    expect(bollette[0]!.price).toBeCloseTo(1.5 * 1.55 * 1.5);
  });
});

describe("una schedina consigliata non perde in media (valori DEMO)", () => {
  it("profili di valore: solo giocate almeno alla quota giusta (ADR 0070)", () => {
    const rule = { minProbability: 0.65, minPrice: 1.25, legs: 3 };
    const rules = { SOLID: rule, BALANCED: rule, HIGH: rule };
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
    // Solida: prima le più probabili, anche con valore −2%; oltre −5% (partita 7) no.
    const rows = [
      row(1, "1X2", "HOME", 0.7),
      row(3, "1X2", "HOME", 0.65),
      row(5, "1X2", "HOME", 0.62),
      row(7, "1X2", "HOME", 0.61),
    ];
    const bollette = buildBollette(
      rows,
      bestItalianPrices([
        odds(1, "h2h", "HOME", 1.4), // −2%
        odds(3, "h2h", "HOME", 1.6), // +4%
        odds(5, "h2h", "HOME", 1.62), // +0,4%
        odds(7, "h2h", "HOME", 1.55), // −5,5%
      ]),
    );
    expect(bollette.map((b) => b.profile)).toEqual(["SOLID"]);
    expect(bollette[0]!.picks.map((p) => p.matchId)).toEqual([1, 3, 5]);
    expect(bollette[0]!.price).toBeGreaterThanOrEqual(3);
  });

  it("selezioni troppo sotto la quota giusta: nessuna schedina", () => {
    // Valore −9% a giocata.
    const rows = [1, 3, 5].map((m) => row(m, "1X2", "HOME", 0.7));
    const far = bestItalianPrices([1, 3, 5].map((m) => odds(m, "h2h", "HOME", 1.3)));
    expect(buildBollette(rows, far)).toEqual([]);
  });

  it("tre schedine, ognuna almeno alla sua quota minima: 3, 5 e 10 (ADR 0072)", () => {
    const plays: [number, number, number][] = [
      [1, 0.66, 1.6],
      [3, 0.65, 1.6],
      [5, 0.63, 1.65],
      [7, 0.55, 1.9],
      [9, 0.52, 2],
      [6, 0.5, 2.1],
      [2, 0.42, 2.5],
      [4, 0.4, 2.6],
    ];
    const rows = plays.map(([m, p]) => row(m, "1X2", "HOME", p));
    const prices = bestItalianPrices(plays.map(([m, , q]) => odds(m, "h2h", "HOME", q)));
    const bollette = buildBollette(rows, prices);
    // Si aggiungono partite finché la quota totale arriva al minimo, poi ci si ferma.
    expect(bollette.map((b) => [b.profile, b.picks.map((p) => p.matchId).sort()])).toEqual([
      ["SOLID", [1, 3, 5]],
      ["BALANCED", [6, 7, 9]],
      ["HIGH", [2, 6, 9]],
    ]);
    expect(bollette.map((b) => Number(b.price.toFixed(2)))).toEqual([4.22, 7.98, 10.5]);
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

describe("quote aggiornate e partite non ancora iniziate", () => {
  const now = new Date("2026-11-26T12:00:00Z");

  it("tiene solo le quote lette nelle ultime 26 ore", () => {
    const rows = [
      { id: 1, observed_at: "2026-11-26T11:00:00Z" },
      { id: 2, observed_at: "2026-11-25T10:00:00Z" }, // 26 ore esatte: ancora valida
      { id: 3, observed_at: "2026-11-25T09:59:59Z" }, // appena oltre
      { id: 4, observed_at: "non è una data" },
    ];
    expect(freshOdds(rows, now).map((r) => r.id)).toEqual([1, 2]);
  });

  it("una quota ferma da giorni non entra né nel consenso né nella quota proposta", () => {
    const odds: LatestOddsRow[] = [
      {
        match_id: 1,
        bookmaker: "DEMO Fermo",
        market: "h2h",
        selection: "HOME",
        price: 3.5,
        observed_at: "2026-11-20T08:00:00Z",
        italian: true,
      },
      {
        match_id: 1,
        bookmaker: "DEMO Fermo",
        market: "h2h",
        selection: "DRAW",
        price: 3.5,
        observed_at: "2026-11-20T08:00:00Z",
        italian: true,
      },
      {
        match_id: 1,
        bookmaker: "DEMO Fermo",
        market: "h2h",
        selection: "AWAY",
        price: 3.5,
        observed_at: "2026-11-20T08:00:00Z",
        italian: true,
      },
      {
        match_id: 1,
        bookmaker: "DEMO Oggi",
        market: "h2h",
        selection: "HOME",
        price: 1.9,
        observed_at: "2026-11-26T08:00:00Z",
        italian: true,
      },
      {
        match_id: 1,
        bookmaker: "DEMO Oggi",
        market: "h2h",
        selection: "DRAW",
        price: 3.6,
        observed_at: "2026-11-26T08:00:00Z",
        italian: true,
      },
      {
        match_id: 1,
        bookmaker: "DEMO Oggi",
        market: "h2h",
        selection: "AWAY",
        price: 4.2,
        observed_at: "2026-11-26T08:00:00Z",
        italian: true,
      },
    ];
    const fresh = freshOdds(odds, now);
    expect(fresh.every((o) => o.bookmaker === "DEMO Oggi")).toBe(true);
    expect(bestItalianPrices(fresh).get("1|h2h|HOME")?.price).toBe(1.9);
    expect(marketConsensus(fresh).get("1|h2h|HOME")).toBeCloseTo(
      1 / 1.9 / (1 / 1.9 + 1 / 3.6 + 1 / 4.2),
      10,
    );
  });

  it("scarta le partite che iniziano entro 15 minuti", () => {
    const rows = [
      { id: 1, kickoff_at: "2026-11-26T12:10:00Z" },
      { id: 2, kickoff_at: "2026-11-26T12:15:00Z" },
      { id: 3, kickoff_at: "2026-11-26T11:00:00Z" },
      { id: 4, kickoff_at: "2026-11-26T20:45:00Z" },
    ];
    expect(notStartingSoon(rows, now).map((r) => r.id)).toEqual([2, 4]);
  });
});

describe("valore mostrato", () => {
  it("solo se resta positivo dopo l'arrotondamento a un decimale", () => {
    expect(hasPositiveValue({ expectedValue: 0.0123 })).toBe(true);
    expect(hasPositiveValue({ expectedValue: 0.0006 })).toBe(true); // +0,1%
    expect(hasPositiveValue({ expectedValue: 0.0004 })).toBe(false); // sarebbe «+0,0%»
    expect(hasPositiveValue({ expectedValue: 0 })).toBe(false);
    expect(hasPositiveValue({ expectedValue: -0.03 })).toBe(false);
  });
});

describe("analisi: ricerca esaustiva e metodi del margine (ADR 0078)", () => {
  const pick = (matchId: number, probability: number, price: number) => ({
    matchId,
    kickoffAt: "2026-11-28T15:00:00Z",
    competitionId: 1,
    home: `DEMO Casa ${matchId}`,
    away: `DEMO Ospite ${matchId}`,
    market: "1X2",
    line: null,
    selection: "HOME",
    probability,
    confidence: 0.8,
    modelProbability: probability,
    marketProbability: probability,
    price,
    bookmaker: "DEMO",
    observedAt: "2026-11-28T08:00:00Z",
    edge: probability * price - 1,
  });
  const rule = { minProbability: 0.3, minPrice: 1.2, legs: 3, targetPrice: 3, minSlipValue: -0.2 };

  it("trova la combinazione più probabile che arriva alla quota", () => {
    // Le due più probabili (0,8 e 0,75) insieme danno quota 1,6 × 1,5 = 2,4: non bastano.
    // La migliore è 0,8 × 0,6 = 0,48 a quota 1,6 × 1,9 = 3,04, meglio di tre partite.
    const pool = [pick(1, 0.8, 1.6), pick(2, 0.75, 1.5), pick(3, 0.6, 1.9), pick(4, 0.5, 1.7)];
    const legs = exhaustiveLegs(rule, pool)!;
    expect(legs.map((p) => p.matchId).sort()).toEqual([1, 3]);
  });

  it("una sola giocata per partita e nessuna schedina se la quota non si raggiunge", () => {
    const same = [pick(1, 0.8, 1.6), { ...pick(1, 0.7, 2.5), selection: "AWAY" }];
    expect(exhaustiveLegs(rule, same)).toBeNull();
    expect(exhaustiveLegs(rule, [pick(1, 0.9, 1.2), pick(2, 0.9, 1.2)])).toBeNull();
  });

  it("il consenso con Shin o potenza toglie più margine allo sfavorito; predefinito proporzionale", () => {
    const odds: LatestOddsRow[] = ["HOME", "DRAW", "AWAY"].map((selection, i) => ({
      match_id: 1,
      bookmaker: "DEMO",
      market: "h2h",
      selection,
      price: [1.5, 4.2, 6.5][i]!,
      observed_at: "2026-11-26T08:00:00Z",
    }));
    const prop = marketConsensus(odds);
    const shin = marketConsensus(odds, "shin");
    const power = marketConsensus(odds, "power");
    expect(prop.get("1|h2h|AWAY")).toBeCloseTo(1 / 6.5 / (1 / 1.5 + 1 / 4.2 + 1 / 6.5), 10);
    expect(shin.get("1|h2h|AWAY")!).toBeLessThan(prop.get("1|h2h|AWAY")!);
    expect(power.get("1|h2h|HOME")!).toBeGreaterThan(prop.get("1|h2h|HOME")!);
    // Doppia chance dal consenso 1X2 con lo stesso metodo.
    expect(shin.get("1|double_chance|HOME_DRAW")).toBeCloseTo(
      shin.get("1|h2h|HOME")! + shin.get("1|h2h|DRAW")!,
      10,
    );
  });
});

describe("solo il periodo attuale (27/11/2026)", () => {
  it("turno: da venerdì a lunedì o da martedì a giovedì, quello che contiene oggi", async () => {
    const { currentWindowStart, inCurrentWindow } = await import("./bollette");
    const friday = new Date("2026-11-27T10:00:00Z");
    expect(currentWindowStart("round", friday)).toBe("2026-11-27");
    expect(inCurrentWindow("2026-11-30T19:45:00Z", "round", friday)).toBe(true); // lunedì
    expect(inCurrentWindow("2026-12-01T19:45:00Z", "round", friday)).toBe(false); // martedì dopo
    expect(inCurrentWindow("2026-12-04", "round", friday)).toBe(false); // turno successivo
    // Giovedì sera: il turno è ancora quello di martedì.
    expect(currentWindowStart("round", new Date("2026-11-26T21:00:00Z"))).toBe("2026-11-24");
  });

  it("giornata: solo oggi, nel fuso di Roma", async () => {
    const { inCurrentWindow } = await import("./bollette");
    const now = new Date("2026-11-27T22:30:00Z"); // 23:30 a Roma
    expect(inCurrentWindow("2026-11-27T19:45:00Z", "day", now)).toBe(true);
    expect(inCurrentWindow("2026-11-28T14:00:00Z", "day", now)).toBe(false);
    expect(inCurrentWindow("2026-11-27", "day", now)).toBe(true);
  });
});
