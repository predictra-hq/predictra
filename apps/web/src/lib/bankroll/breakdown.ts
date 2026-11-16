/**
 * "Come sto andando": le giocate chiuse raggruppate per mese, tipo di giocata e sito.
 * Funzioni pure sui dati già letti dalla pagina (solo le giocate dell'utente).
 */

export interface BreakdownBet {
  status: string;
  stake: number | string;
  profit: number | string | null;
  settled_at: string | null;
  market: string;
  bookmaker: string | null;
  description?: string | null;
}

export interface BreakdownRow {
  key: string;
  bets: number;
  wins: number;
  staked: number;
  profit: number;
  /** Profitto diviso per il puntato; null senza puntate. */
  yield: number | null;
}

const settled = (b: BreakdownBet) => b.status !== "OPEN" && b.profit !== null;

/** Raggruppa le giocate chiuse secondo `keyOf`; i gruppi senza chiave vanno in `fallback`. */
export function breakdown(
  bets: readonly BreakdownBet[],
  keyOf: (bet: BreakdownBet) => string | null,
  fallback: string,
): BreakdownRow[] {
  const groups = new Map<string, BreakdownRow>();
  for (const bet of bets.filter(settled)) {
    const key = keyOf(bet)?.trim() || fallback;
    const row = groups.get(key) ?? { key, bets: 0, wins: 0, staked: 0, profit: 0, yield: null };
    const profit = Number(bet.profit);
    row.bets += 1;
    row.wins += profit > 0 ? 1 : 0;
    row.staked += Number(bet.stake);
    row.profit += profit;
    groups.set(key, row);
  }
  return [...groups.values()].map((r) => ({
    ...r,
    staked: Math.round(r.staked * 100) / 100,
    profit: Math.round(r.profit * 100) / 100,
    yield: r.staked > 0 ? r.profit / r.staked : null,
  }));
}

/** Per mese di chiusura (`2026-11`), dal più recente. */
export function byMonth(bets: readonly BreakdownBet[]): BreakdownRow[] {
  return breakdown(bets, (b) => b.settled_at?.slice(0, 7) ?? null, "–").sort((a, b) =>
    b.key.localeCompare(a.key),
  );
}

/** Per chiave libera (tipo di giocata, sito), dal profitto più alto. */
export function byKey(
  bets: readonly BreakdownBet[],
  keyOf: (bet: BreakdownBet) => string | null,
  fallback: string,
): BreakdownRow[] {
  return breakdown(bets, keyOf, fallback).sort((a, b) => b.profit - a.profit);
}

/** La giocata chiusa andata meglio e quella andata peggio (null se non ce ne sono). */
export function extremes<T extends BreakdownBet>(bets: readonly T[]): { best: T; worst: T } | null {
  const done = bets.filter(settled);
  if (done.length === 0) return null;
  const sorted = [...done].sort((a, b) => Number(b.profit) - Number(a.profit));
  return { best: sorted[0]!, worst: sorted.at(-1)! };
}
