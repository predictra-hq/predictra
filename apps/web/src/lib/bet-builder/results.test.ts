import { describe, expect, it } from "vitest";
import {
  dedupeProposals,
  legOutcome,
  proposalOutcome,
  settleProposals,
  summarize,
  type MatchScore,
  type PastProposal,
  type ResultLeg,
} from "./results";

const leg = (
  match: number,
  market: string,
  selection: string,
  line: number | null = null,
): ResultLeg => ({ match_id: match, market, line, selection });

const proposal = (
  id: number,
  legs: ResultLeg[],
  price: number,
  probability: number,
  createdAt = "2026-11-20T08:00:00Z",
): PastProposal => ({
  id,
  category: "BALANCED",
  created_at: createdAt,
  last_kickoff_at: "2026-11-22T18:00:00Z",
  probability,
  combined_price: price,
  legs,
});

describe("esito delle selezioni (valori DEMO)", () => {
  it("1X2, doppia chance e under/over dal risultato", () => {
    const score: MatchScore = { home: 2, away: 1 };
    expect(legOutcome(leg(1, "1X2", "HOME"), score)).toBe("WON");
    expect(legOutcome(leg(1, "1X2", "DRAW"), score)).toBe("LOST");
    expect(legOutcome(leg(1, "DOUBLE_CHANCE", "DRAW_AWAY"), score)).toBe("LOST");
    expect(legOutcome(leg(1, "DOUBLE_CHANCE", "HOME_AWAY"), score)).toBe("WON");
    expect(legOutcome(leg(1, "DOUBLE_CHANCE", "HOME_DRAW"), { home: 1, away: 1 })).toBe("WON");
    expect(legOutcome(leg(1, "TOTAL_GOALS", "OVER", 2.5), score)).toBe("WON");
    expect(legOutcome(leg(1, "TOTAL_GOALS", "UNDER", 2.5), score)).toBe("LOST");
    expect(legOutcome(leg(1, "TOTAL_GOALS", "OVER", 3.5), score)).toBe("LOST");
  });

  it("mercati non valutabili: nessun esito", () => {
    const score: MatchScore = { home: 2, away: 1 };
    expect(legOutcome(leg(1, "BTTS", "YES"), score)).toBeNull();
    expect(legOutcome(leg(1, "TOTAL_GOALS", "OVER", 3), score)).toBeNull(); // linea intera
    expect(legOutcome(leg(1, "1X2", "ALTRO"), score)).toBeNull();
  });
});

describe("esito delle proposte (valori DEMO)", () => {
  const scores = new Map<number, MatchScore>([
    [1, { home: 2, away: 0 }],
    [2, { home: 0, away: 0 }],
  ]);

  it("vinta se escono tutte, persa appena una è sbagliata, in attesa senza risultato", () => {
    expect(proposalOutcome([leg(1, "1X2", "HOME"), leg(2, "1X2", "DRAW")], scores)).toBe("WON");
    expect(proposalOutcome([leg(1, "1X2", "HOME"), leg(2, "1X2", "HOME")], scores)).toBe("LOST");
    expect(proposalOutcome([leg(1, "1X2", "HOME"), leg(3, "1X2", "HOME")], scores)).toBe("PENDING");
    // Una selezione già sbagliata chiude la proposta anche se un'altra partita manca.
    expect(proposalOutcome([leg(1, "1X2", "AWAY"), leg(3, "1X2", "HOME")], scores)).toBe("LOST");
    expect(proposalOutcome([], scores)).toBe("PENDING");
  });

  it("la stessa combinazione riproposta si conta una volta, alla prima quota", () => {
    const a = proposal(1, [leg(1, "1X2", "HOME"), leg(2, "1X2", "DRAW")], 5.0, 0.2);
    const b = proposal(
      2,
      [leg(2, "1X2", "DRAW"), leg(1, "1X2", "HOME")],
      5.5,
      0.2,
      "2026-11-20T17:00:00Z",
    );
    const unique = dedupeProposals([b, a]);
    expect(unique).toHaveLength(1);
    expect(unique[0]!.id).toBe(1);
    expect(unique[0]!.combined_price).toBe(5.0);
  });

  it("riepilogo: successo, atteso, guadagno e rendimento a puntata fissa", () => {
    const settled = settleProposals(
      [
        proposal(1, [leg(1, "1X2", "HOME")], 1.8, 0.6), // vinta: +0,80
        proposal(2, [leg(2, "1X2", "HOME")], 2.4, 0.4), // persa: −1
        proposal(3, [leg(3, "1X2", "HOME")], 2.0, 0.5), // in attesa
      ],
      scores,
    );
    const s = summarize(settled);
    expect(s.settled).toBe(2);
    expect(s.won).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.hitRate).toBe(0.5);
    expect(s.expectedHitRate).toBeCloseTo(0.5);
    expect(s.averagePrice).toBeCloseTo(2.1);
    expect(s.profit).toBeCloseTo(-0.2);
    expect(s.yield).toBeCloseTo(-0.1);
  });

  it("senza proposte chiuse non c'è rendimento", () => {
    const s = summarize([]);
    expect(s.settled).toBe(0);
    expect(s.hitRate).toBeNull();
    expect(s.yield).toBeNull();
    expect(s.profit).toBe(0);
  });
});
