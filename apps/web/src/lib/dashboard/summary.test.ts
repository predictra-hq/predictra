import { describe, expect, it } from "vitest";
import type {
  ActiveBetProposalRow,
  ActivePredictionRow,
  BankrollSummaryRow,
} from "@predictra/shared-types";
import { bankrollTotals, favourite, topProposals, upcomingMatches } from "./summary";

const pred = (
  match_id: number,
  selection: string,
  probability: number,
  kickoff_at = "2026-11-10T19:45:00Z",
  market = "1X2",
) =>
  ({
    match_id,
    selection,
    probability,
    kickoff_at,
    market,
    competition_id: 2019,
    home_team_name: `Casa ${match_id}`,
    away_team_name: `Ospite ${match_id}`,
    confidence_score: 0.6,
  }) as unknown as ActivePredictionRow;

describe("prossime partite", () => {
  it("raggruppa per partita, ordina per calcio d'inizio ed esclude previsioni incomplete", () => {
    const rows = [
      pred(2, "HOME", 0.5, "2026-11-11T18:00:00Z"),
      pred(2, "DRAW", 0.3, "2026-11-11T18:00:00Z"),
      pred(2, "AWAY", 0.2, "2026-11-11T18:00:00Z"),
      pred(1, "HOME", 0.2),
      pred(1, "DRAW", 0.25),
      pred(1, "AWAY", 0.55),
      pred(1, "OVER", 0.6, "2026-11-10T19:45:00Z", "TOTAL_GOALS"),
      pred(3, "HOME", 0.4),
    ];
    const list = upcomingMatches(rows, 10);
    expect(list.map((m) => m.matchId)).toEqual([1, 2]);
    expect(list[0]).toMatchObject({ home1x2: 0.2, draw: 0.25, away1x2: 0.55, home: "Casa 1" });
    expect(favourite(list[0]!)).toBe("AWAY");
    expect(favourite(list[1]!)).toBe("HOME");
    expect(upcomingMatches(rows, 1)).toHaveLength(1);
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
