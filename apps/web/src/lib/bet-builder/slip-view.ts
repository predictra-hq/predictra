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
 * Le selezioni 1X2 prendono probabilità e migliore quota FRESH; le altre restano senza
 * numeri, che la valutazione segnala (mai valori inventati).
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

  const current = (matchId: number, market: string, selection: string): ManualSelection => {
    const found =
      market === "1X2"
        ? outcomes.find((o) => o.matchId === matchId && o.selection === selection)
        : undefined;
    if (found) return found;
    const match = matches.get(matchId);
    return {
      matchId,
      homeTeam: match?.home_team_name ?? `#${matchId}`,
      awayTeam: match?.away_team_name ?? "",
      kickoffAt: match?.kickoff_at ?? now.toISOString(),
      selection,
      probability: null,
      confidence: null,
      price: null,
      freshness: null,
    };
  };

  return slips.map((slip) => ({
    slip,
    selections: slip.selections.map((x) => current(x.match_id, x.market, x.selection)),
  }));
}
