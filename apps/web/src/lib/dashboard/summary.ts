/** Aggregazioni pure per la dashboard (testate in summary.test.ts). */
import type {
  ActiveBetProposalRow,
  ActivePredictionRow,
  BankrollSummaryRow,
  BetProposalCategory,
  MatchCenterRow,
} from "@predictra/shared-types";

export interface Probabilities1x2 {
  home: number;
  draw: number;
  away: number;
  confidence: number;
}

export interface UpcomingMatch {
  matchId: number;
  kickoffAt: string;
  competitionName: string;
  home: string;
  away: string;
  /** Previsione 1X2 del modello attivo; null se non c'è (o è incompleta). */
  prediction: Probabilities1x2 | null;
}

/**
 * Unisce il calendario con le previsioni 1X2: una previsione conta solo se ha tutte e tre
 * le selezioni (niente dati parziali). L'ordine resta quello del calendario.
 */
export function withPredictions(
  matches: readonly MatchCenterRow[],
  predictions: readonly ActivePredictionRow[],
): UpcomingMatch[] {
  return matches.map((match) => {
    const rows = predictions.filter((r) => r.match_id === match.match_id && r.market === "1X2");
    const p = (sel: string) => rows.find((r) => r.selection === sel);
    const [home, draw, away] = [p("HOME"), p("DRAW"), p("AWAY")];
    return {
      matchId: match.match_id,
      kickoffAt: match.kickoff_at,
      competitionName: match.competition_name,
      home: match.home_team_short_name ?? match.home_team_name,
      away: match.away_team_short_name ?? match.away_team_name,
      prediction:
        home && draw && away
          ? {
              home: Number(home.probability),
              draw: Number(draw.probability),
              away: Number(away.probability),
              confidence: Number(home.confidence_score),
            }
          : null,
    };
  });
}

/** Esito più probabile secondo il modello. */
export function favourite(p: Probabilities1x2): "HOME" | "DRAW" | "AWAY" {
  if (p.home >= p.draw && p.home >= p.away) return "HOME";
  return p.away >= p.draw ? "AWAY" : "DRAW";
}

export interface BankrollTotals {
  count: number;
  balance: number;
  available: number;
  settledProfit: number;
  settledStakes: number;
  openBets: number;
  /** ROI sulle giocate chiuse; null senza giocate chiuse. */
  roi: number | null;
}

export function bankrollTotals(rows: readonly BankrollSummaryRow[]): BankrollTotals {
  const sum = (k: keyof BankrollSummaryRow) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const settledStakes = sum("settled_stakes");
  const settledProfit = sum("settled_profit");
  return {
    count: rows.length,
    balance: sum("balance"),
    available: sum("available"),
    settledProfit,
    settledStakes,
    openBets: sum("open_bets"),
    roi: settledStakes > 0 ? settledProfit / settledStakes : null,
  };
}

/** La migliore proposta (rank più basso) per categoria, nell'ordine prudente → aggressiva. */
export function topProposals(rows: readonly ActiveBetProposalRow[]): ActiveBetProposalRow[] {
  const order: BetProposalCategory[] = ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"];
  return order.flatMap((c) => {
    const best = rows
      .filter((r) => r.category === c)
      .sort((a, b) => a.rank - b.rank || a.proposal_id - b.proposal_id)[0];
    return best ? [best] : [];
  });
}
