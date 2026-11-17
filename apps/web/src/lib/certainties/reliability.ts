import type { ActivePredictionRow } from "@predictra/shared-types";
import {
  combinedProbability,
  DEFAULT_MARKET_WEIGHT,
  isEligible,
  settle,
  type MarketLookup,
} from "./logic";

/** Quante giocate di un gruppo sono uscite, e quanto erano date in media. */
export interface GroupStat {
  key: string;
  count: number;
  wins: number;
  /** Probabilità media con cui erano date. */
  predicted: number;
  /** Quante sono uscite, in proporzione. */
  observed: number;
}

/** Sotto questo numero di giocate la percentuale dice poco: si mostra solo il conteggio. */
export const MIN_SAMPLE = 20;

/**
 * Riepilogo delle giocate già decise, raggruppate con `keyOf` (tipo di giocata,
 * campionato…). Stesse regole della verifica per fascia delle Certezze: stesse giocate
 * ammesse, stessa probabilità combinata, esito al 90'. Si contano solo le giocate date
 * almeno a `minProbability`. Gruppi ordinati dal più numeroso.
 */
export function groupStats(
  rows: readonly ActivePredictionRow[],
  results: ReadonlyMap<number, { home: number; away: number }>,
  keyOf: (row: ActivePredictionRow) => string,
  minProbability: number,
  market: MarketLookup = () => null,
  weight: number = DEFAULT_MARKET_WEIGHT,
): GroupStat[] {
  const groups = new Map<string, { count: number; wins: number; sum: number }>();
  for (const r of rows) {
    if (!isEligible(r)) continue;
    const score = results.get(r.match_id);
    if (!score) continue;
    const p = combinedProbability(Number(r.probability), market(r), weight);
    if (!(p >= minProbability)) continue;
    const won = settle(
      r.market,
      r.line === null ? null : Number(r.line),
      r.selection,
      score.home,
      score.away,
    );
    if (won === null) continue;
    const key = keyOf(r);
    const g = groups.get(key) ?? { count: 0, wins: 0, sum: 0 };
    g.count += 1;
    g.sum += p;
    if (won) g.wins += 1;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      count: g.count,
      wins: g.wins,
      predicted: g.sum / g.count,
      observed: g.wins / g.count,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Somma di più gruppi in uno solo; `null` se non c'è nessuna giocata. */
export function totalStat(stats: readonly GroupStat[]): GroupStat | null {
  const count = stats.reduce((a, s) => a + s.count, 0);
  if (count === 0) return null;
  const wins = stats.reduce((a, s) => a + s.wins, 0);
  return {
    key: "total",
    count,
    wins,
    predicted: stats.reduce((a, s) => a + s.predicted * s.count, 0) / count,
    observed: wins / count,
  };
}
