/** Aggregazioni pure per la dashboard (testate in summary.test.ts). */
import type {
  ActiveBetProposalRow,
  ActivePredictionRow,
  BankrollSummaryRow,
  BetProposalCategory,
} from "@predictra/shared-types";

export interface UpcomingMatch {
  matchId: number;
  kickoffAt: string;
  competitionId: number;
  home: string;
  away: string;
  /** Probabilità 1X2 del modello attivo; somma ~1. */
  home1x2: number;
  draw: number;
  away1x2: number;
  confidence: number;
}

/**
 * Prossime partite con la previsione 1X2 completa (le tre selezioni), in ordine di
 * calcio d'inizio. Le partite con selezioni mancanti vengono escluse: niente dati parziali.
 */
export function upcomingMatches(
  rows: readonly ActivePredictionRow[],
  limit: number,
): UpcomingMatch[] {
  const byMatch = new Map<number, ActivePredictionRow[]>();
  for (const r of rows) {
    if (r.market !== "1X2") continue;
    const list = byMatch.get(r.match_id) ?? [];
    list.push(r);
    byMatch.set(r.match_id, list);
  }
  const result: UpcomingMatch[] = [];
  for (const [matchId, list] of byMatch) {
    const p = (sel: string) => list.find((r) => r.selection === sel);
    const home = p("HOME");
    const draw = p("DRAW");
    const away = p("AWAY");
    if (!home || !draw || !away) continue;
    result.push({
      matchId,
      kickoffAt: home.kickoff_at,
      competitionId: home.competition_id,
      home: home.home_team_name,
      away: home.away_team_name,
      home1x2: Number(home.probability),
      draw: Number(draw.probability),
      away1x2: Number(away.probability),
      confidence: Number(home.confidence_score),
    });
  }
  return result
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.matchId - b.matchId)
    .slice(0, limit);
}

/** Esito più probabile secondo il modello. */
export function favourite(m: UpcomingMatch): "HOME" | "DRAW" | "AWAY" {
  if (m.home1x2 >= m.draw && m.home1x2 >= m.away1x2) return "HOME";
  return m.away1x2 >= m.draw ? "AWAY" : "DRAW";
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
