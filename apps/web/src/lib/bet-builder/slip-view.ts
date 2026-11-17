import "server-only";
import type { ManualSelection } from "./evaluate";
import { listManualOptions, listMatches, listSlips, type SlipWithSelections } from "./queries";

export interface SlipView {
  slip: SlipWithSelections;
  /** Selezioni con probabilità e quote attuali (ricalcolate a ogni apertura). */
  selections: ManualSelection[];
}

/**
 * Schedine dell'utente (RLS: solo le proprie) con i valori attuali di ogni selezione.
 * Le selezioni dei mercati di Costruisci prendono probabilità e migliore quota italiana;
 * le altre restano senza numeri, che la valutazione segnala (mai valori inventati).
 */
export async function loadSlipViews(now: Date, slipId?: number): Promise<SlipView[]> {
  const all = await listSlips();
  const slips = slipId === undefined ? all : all.filter((s) => s.id === slipId);
  const matchIds = [...new Set(slips.flatMap((s) => s.selections.map((x) => x.match_id)))];
  const [options, matches] = await Promise.all([
    listManualOptions(now, matchIds),
    listMatches(matchIds),
  ]);
  const outcomes = options.flatMap((o) => o.outcomes);

  const current = (
    matchId: number,
    market: string,
    line: number | null,
    selection: string,
  ): ManualSelection => {
    const found = outcomes.find(
      (o) =>
        o.matchId === matchId &&
        o.market === market &&
        o.line === line &&
        o.selection === selection,
    );
    if (found) return found;
    const match = matches.get(matchId);
    return {
      matchId,
      homeTeam: match?.home_team_name ?? `#${matchId}`,
      awayTeam: match?.away_team_name ?? "",
      kickoffAt: match?.kickoff_at ?? now.toISOString(),
      market,
      line,
      selection,
      probability: null,
      confidence: null,
      price: null,
      freshness: null,
    };
  };

  return slips.map((slip) => ({
    slip,
    selections: slip.selections.map((x) =>
      current(x.match_id, x.market, x.line === null ? null : Number(x.line), x.selection),
    ),
  }));
}
