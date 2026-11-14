import { describe, expect, it } from "vitest";
import { buildBollette, oddsAreOld, playablePicks, roundOfKickoff } from "./bollette";
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

const odds = (match: number, market: string, selection: string, price: number): LatestOddsRow => ({
  match_id: match,
  bookmaker: "DEMO (IT)",
  market,
  selection,
  price,
  observed_at: "2026-11-20T08:00:00Z",
});

describe("bollette consigliate (valori DEMO)", () => {
  it("turno dal calcio d'inizio nel fuso di Roma", () => {
    expect(roundOfKickoff("2026-11-21T18:00:00Z")).toBe("2026-11-20");
    expect(roundOfKickoff("2026-11-23T20:00:00Z")).toBe("2026-11-20");
    // Lunedì alle 23:30 UTC è già martedì a Roma: turno infrasettimanale.
    expect(roundOfKickoff("2026-11-23T23:30:00Z")).toBe("2026-11-24");
  });

  it("solo selezioni con quota italiana reale e vantaggio credibile", () => {
    const prices = bestItalianPrices([
      odds(1, "h2h", "HOME", 1.6),
      odds(2, "h2h", "HOME", 3.0), // modello 0,60 × 3,00: vantaggio +80%, non credibile
      odds(3, "h2h", "HOME", 1.2), // modello 0,60 × 1,20: vantaggio −28%, quota cattiva
      odds(5, "h2h", "HOME", 1.6),
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
    expect(picks[0]!.edge).toBeCloseTo(-0.04);
    expect(picks[0]!.bookmaker).toBe("DEMO (IT)");
  });

  it("un profilo per soglie di probabilità e quota; quota totale dalle quote reali", () => {
    const rows = [
      // Partita 1: doppia chance molto probabile ma a quota bassa, 1 a quota migliore.
      row(1, "DOUBLE_CHANCE", "HOME_DRAW", 0.85),
      row(1, "1X2", "HOME", 0.6),
      row(2, "TOTAL_GOALS", "OVER", 0.7, 1.5),
      row(3, "1X2", "HOME", 0.68),
      row(4, "1X2", "AWAY", 0.45),
    ];
    const prices = bestItalianPrices([
      odds(1, "double_chance", "HOME_DRAW", 1.12),
      odds(1, "h2h", "HOME", 1.65),
      odds(2, "totals_1_5", "OVER", 1.4),
      odds(3, "h2h", "HOME", 1.5),
      odds(4, "h2h", "AWAY", 2.3),
    ]);
    const bollette = buildBollette(rows, prices);
    // Alta quota (almeno 42% e quota 1,80): una sola selezione valida, la 4. Non basta
    // per una multipla, quindi il profilo non viene proposto: nessuna bolletta forzata.
    expect(bollette.map((b) => b.profile)).toEqual(["SOLID", "BALANCED"]);
    expect(bollette.every((b) => b.round === "2026-11-20")).toBe(true);

    const [solid, balanced] = bollette;
    // Solida: almeno 65% e quota 1,25. La doppia chance a 1,12 resta fuori.
    expect(solid!.picks.map((p) => [p.matchId, p.selection])).toEqual([
      [3, "HOME"],
      [2, "OVER"],
    ]);
    expect(solid!.price).toBeCloseTo(1.5 * 1.4);
    expect(solid!.probability).toBeCloseTo(0.68 * 0.7);
    // Equilibrata: almeno 55% e quota 1,45.
    expect(balanced!.picks.map((p) => p.matchId)).toEqual([1, 3]);
    expect(balanced!.price).toBeCloseTo(1.65 * 1.5);
    // Quote lette alle 08:00 del 20/11: aggiornate fino a 12 ore dopo, poi da ricontrollare.
    expect(solid!.oddsObservedAt).toBe("2026-11-20T08:00:00Z");
    expect(oddsAreOld(solid!, new Date("2026-11-20T19:00:00Z"))).toBe(false);
    expect(oddsAreOld(solid!, new Date("2026-11-21T09:00:00Z"))).toBe(true);
  });

  it("profili con le stesse selezioni non si ripetono; squadre tutte diverse", () => {
    const rows = [
      row(1, "1X2", "HOME", 0.7),
      row(3, "1X2", "HOME", 0.66),
      // Stessa squadra di casa della partita 1: non può stare nella stessa bolletta.
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
    expect(bollette[0]!.picks.map((p) => p.matchId)).toEqual([1, 3]);
  });
});
