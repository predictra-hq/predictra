import { describe, expect, it } from "vitest";
import type {
  ActiveBetProposalRow,
  ActivePredictionRow,
  BankrollSummaryRow,
  MatchCenterRow,
} from "@predictra/shared-types";
import {
  bankrollTotals,
  favourite,
  predictionExpectedFrom,
  topProposals,
  withPredictions,
} from "./summary";

const pred = (match_id: number, selection: string, probability: number, market = "1X2") =>
  ({
    match_id,
    selection,
    probability,
    market,
    confidence_score: 0.6,
  }) as unknown as ActivePredictionRow;

const match = (match_id: number) =>
  ({
    match_id,
    kickoff_at: `2026-11-1${match_id}T19:45:00Z`,
    competition_name: "Serie A",
    home_team_name: `Casa ${match_id} FC`,
    home_team_short_name: `Casa ${match_id}`,
    away_team_name: `Ospite ${match_id}`,
    away_team_short_name: null,
  }) as unknown as MatchCenterRow;

describe("prossime partite", () => {
  it("abbina le previsioni 1X2 complete e lascia null quelle mancanti o incomplete", () => {
    const list = withPredictions(
      [match(1), match(2), match(3)],
      [
        pred(1, "HOME", 0.2),
        pred(1, "DRAW", 0.25),
        pred(1, "AWAY", 0.55),
        pred(1, "OVER", 0.6, "TOTAL_GOALS"),
        pred(2, "HOME", 0.5),
      ],
    );
    expect(list.map((m) => m.matchId)).toEqual([1, 2, 3]);
    expect(list[0]).toMatchObject({ home: "Casa 1", away: "Ospite 1", competitionName: "Serie A" });
    expect(list[0]!.prediction).toEqual({ home: 0.2, draw: 0.25, away: 0.55, confidence: 0.6 });
    expect(favourite(list[0]!.prediction!)).toBe("AWAY");
    expect(list[1]!.prediction).toBeNull();
    expect(list[2]!.prediction).toBeNull();
    expect(favourite({ home: 0.5, draw: 0.3, away: 0.2, confidence: 1 })).toBe("HOME");
  });
});

describe("data attesa della previsione", () => {
  it("calcio d'inizio meno l'orizzonte di 10 giorni", () => {
    expect(predictionExpectedFrom("2026-11-20T19:30:00Z").toISOString()).toBe(
      "2026-11-10T19:30:00.000Z",
    );
  });
});

describe("totali del bankroll", () => {
  it("somma i bankroll e calcola il ROI solo con giocate chiuse", () => {
    const b = (balance: number, profit: number, stakes: number, open: number) =>
      ({
        balance,
        available: balance - 10,
        settled_profit: profit,
        settled_stakes: stakes,
        open_bets: open,
      }) as unknown as BankrollSummaryRow;
    const t = bankrollTotals([b(100, 5, 50, 1), b(200, -1, 50, 0)]);
    expect(t).toMatchObject({ count: 2, balance: 300, available: 280, openBets: 1 });
    expect(t.roi).toBeCloseTo(0.04);
    expect(bankrollTotals([]).roi).toBeNull();
  });
});

describe("proposte in evidenza", () => {
  it("una per categoria, la migliore, in ordine prudente → aggressiva", () => {
    const p = (proposal_id: number, category: string, rank: number) =>
      ({ proposal_id, category, rank }) as unknown as ActiveBetProposalRow;
    const top = topProposals([
      p(1, "AGGRESSIVE", 1),
      p(2, "CONSERVATIVE", 2),
      p(3, "CONSERVATIVE", 1),
    ]);
    expect(top.map((r) => r.proposal_id)).toEqual([3, 1]);
  });
});
