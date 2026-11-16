import { describe, expect, it } from "vitest";
import {
  bestItalianPrices,
  bestPicks,
  combinedItalianPrice,
  italianPriceFor,
  likelyMultiples,
  oddsMarketFor,
  type LikelyRow,
} from "./likely";

const row = (
  match: number,
  market: string,
  selection: string,
  probability: number,
  line: number | null = null,
  confidence = 0.8,
): LikelyRow => ({
  match_id: match,
  kickoff_at: `2026-11-2${match}T18:00:00Z`,
  home_team_name: `DEMO Casa ${match}`,
  away_team_name: `DEMO Ospite ${match}`,
  market,
  line,
  selection,
  probability,
  confidence_score: confidence,
});

describe("le più probabili (valori DEMO)", () => {
  it("per ogni partita il pronostico più probabile tra i mercati ammessi", () => {
    const picks = bestPicks([
      row(1, "1X2", "HOME", 0.62),
      row(1, "DOUBLE_CHANCE", "HOME_DRAW", 0.84),
      row(1, "TOTAL_GOALS", "OVER", 0.95, 0.5), // linea non ammessa
      row(1, "TOTAL_GOALS", "OVER", 0.93, 1.5), // quasi certo: escluso
      row(1, "CORRECT_SCORE", "1-0", 0.99), // mercato non ammesso
      row(2, "BTTS", "YES", 0.66),
      row(2, "TOTAL_GOALS", "UNDER", 0.7, 3.5),
      row(2, "1X2", "AWAY", 0.8, null, 0.3), // Confidence Score bassa: esclusa
      row(3, "1X2", "DRAW", 0.3), // sotto il 50%: nessun pronostico
    ]);
    expect(picks.map((p) => [p.matchId, p.market, p.selection, p.line])).toEqual([
      [1, "DOUBLE_CHANCE", "HOME_DRAW", null],
      [2, "TOTAL_GOALS", "UNDER", 3.5],
    ]);
  });

  it("multiple più probabili: prodotto delle probabilità, quota equa 1/p", () => {
    const picks = bestPicks([
      row(1, "DOUBLE_CHANCE", "HOME_DRAW", 0.8),
      row(2, "BTTS", "NO", 0.6),
      row(3, "TOTAL_GOALS", "UNDER", 0.7, 2.5, 0.5),
    ]);
    const [two, three] = likelyMultiples(picks);
    expect(two!.category).toBe("CONSERVATIVE");
    expect(two!.picks.map((p) => p.matchId)).toEqual([1, 3]);
    expect(two!.probability).toBeCloseTo(0.56);
    expect(two!.fairOdds).toBeCloseTo(1 / 0.56);
    expect(two!.confidence).toBe(0.5);
    expect(three!.category).toBe("BALANCED");
    expect(three!.probability).toBeCloseTo(0.336);
    // Finite le partite: l'aggressiva non aggiungerebbe nulla all'equilibrata.
    expect(likelyMultiples(picks)).toHaveLength(2);
  });

  it("una multipla per categoria: la più lunga sopra la soglia, al massimo 12 partite", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      matchId: i + 1,
      kickoffAt: `2026-11-20T${String(10 + (i % 10)).padStart(2, "0")}:00:00Z`,
      home: `DEMO Casa ${i + 1}`,
      away: `DEMO Ospite ${i + 1}`,
      market: i % 2 === 0 ? "TOTAL_GOALS" : "1X2",
      line: i % 2 === 0 ? 2.5 : null,
      selection: i % 2 === 0 ? "UNDER" : "HOME",
      probability: 0.85,
      confidence: 0.8,
    }));
    const multiples = likelyMultiples(many);
    // 0,85^4 ≈ 0,52 ≥ 0,50; 0,85^8 ≈ 0,27 ≥ 0,25; 0,85^14 ≈ 0,10 ma il tetto è 12.
    expect(multiples.map((x) => [x.category, x.size])).toEqual([
      ["CONSERVATIVE", 4],
      ["BALANCED", 8],
      ["AGGRESSIVE", 12],
    ]);
    // Dentro la schedina: prima 1X2, poi under/over.
    expect(multiples[0]!.picks.map((p) => p.market)).toEqual([
      "1X2",
      "1X2",
      "TOTAL_GOALS",
      "TOTAL_GOALS",
    ]);
  });

  it("nessuna multipla se due pronostici non restano sopra la soglia più bassa", () => {
    const picks = bestPicks([row(1, "1X2", "HOME", 0.55)]);
    expect(likelyMultiples(picks)).toEqual([]);
  });

  it("quota italiana reale del pronostico, se raccolta (ADR 0029)", () => {
    expect(oddsMarketFor("TOTAL_GOALS", 2.5)).toBe("totals_2_5");
    expect(oddsMarketFor("TOTAL_GOALS", 2)).toBeNull();
    expect(oddsMarketFor("1X2", null)).toBe("h2h");
    expect(oddsMarketFor("BTTS", null)).toBeNull();
    expect(oddsMarketFor("DOUBLE_CHANCE", null)).toBe("double_chance");
    const prices = bestItalianPrices([
      {
        match_id: 1,
        bookmaker: "demo_it",
        market: "totals_2_5",
        selection: "UNDER",
        price: 1.8,
        observed_at: "t1",
      },
      {
        match_id: 1,
        bookmaker: "demo2_it",
        market: "totals_2_5",
        selection: "UNDER",
        price: 1.85,
        observed_at: "t2",
      },
    ]);
    const pick = { matchId: 1, market: "TOTAL_GOALS", line: 2.5, selection: "UNDER" };
    expect(italianPriceFor(prices, pick)).toEqual({
      price: 1.85,
      bookmaker: "demo2_it",
      observedAt: "t2",
    });
    expect(italianPriceFor(prices, { ...pick, selection: "OVER" })).toBeNull();
  });

  it("quota italiana combinata solo se tutte le selezioni ne hanno una", () => {
    const prices = bestItalianPrices([
      {
        match_id: 1,
        bookmaker: "DEMO",
        market: "h2h",
        selection: "HOME",
        price: 1.5,
        observed_at: "t",
      },
      {
        match_id: 2,
        bookmaker: "DEMO",
        market: "totals_2_5",
        selection: "UNDER",
        price: 2,
        observed_at: "t",
      },
    ]);
    const a = { matchId: 1, market: "1X2", line: null, selection: "HOME" };
    const b = { matchId: 2, market: "TOTAL_GOALS", line: 2.5, selection: "UNDER" };
    const c = { matchId: 3, market: "BTTS", line: null, selection: "YES" };
    expect(combinedItalianPrice(prices, [a, b])).toBeCloseTo(3);
    expect(combinedItalianPrice(prices, [a, c])).toBeNull();
  });
});

describe("quote del sito dell'utente e confronto", () => {
  const row = (bookmaker: string, price: number) => ({
    match_id: 1,
    bookmaker,
    market: "h2h",
    selection: "HOME",
    price,
    observed_at: "2026-11-19T10:00:00Z",
  });

  it("senza sito: la migliore quota italiana", () => {
    const prices = bestItalianPrices([row("DEMO A", 1.8), row("DEMO B", 1.95)]);
    expect(prices.get("1|h2h|HOME")).toMatchObject({ price: 1.95, bookmaker: "DEMO B" });
  });

  it("con il sito: la sua quota, e dove si trova di meglio", () => {
    const prices = bestItalianPrices([row("DEMO A", 1.8), row("DEMO B", 1.95)], "DEMO A");
    expect(prices.get("1|h2h|HOME")).toMatchObject({
      price: 1.8,
      bookmaker: "DEMO A",
      better: { price: 1.95, bookmaker: "DEMO B" },
    });
  });

  it("il sito ha già la quota più alta, o non ha quote per quella giocata", () => {
    const top = bestItalianPrices([row("DEMO A", 2), row("DEMO B", 1.95)], "DEMO A");
    expect(top.get("1|h2h|HOME")!.better).toBeUndefined();
    const missing = bestItalianPrices([row("DEMO B", 1.95)], "DEMO A");
    expect(missing.get("1|h2h|HOME")).toMatchObject({ price: 1.95, bookmaker: "DEMO B" });
  });
});
