/**
 * Metriche del bankroll (M6, ADR 0030). Reali e simulate non si sommano mai:
 * `metricsByKind` le calcola separatamente.
 *
 * Definizioni:
 * - profitto = Σ (incasso − stake) delle giocate chiuse;
 * - yield = profitto / Σ stake delle giocate chiuse (rendimento sul giocato);
 * - ROI = profitto / capitale netto versato (depositi − prelievi), se positivo;
 * - percentuale di successo = giocate chiuse in profitto / giocate chiuse esclusi i VOID;
 * - drawdown massimo = massima discesa del profitto cumulato dal suo picco, in ordine
 *   di chiusura; in percentuale sul capitale netto versato più il picco raggiunto.
 */
import type { BankrollKind, BetStatus, MovementKind } from "@predictra/shared-types";
import { toCents, toEuros } from "./money";

export interface BetLike {
  status: BetStatus;
  stake: number;
  odds: number;
  payout: number | null;
  settled_at: string | null;
  placed_at?: string;
  bankroll_kind?: BankrollKind;
}

export interface MovementLike {
  kind: MovementKind;
  amount: number;
}

export interface BankrollMetrics {
  bets: number;
  openBets: number;
  settledBets: number;
  openStakes: number;
  staked: number;
  profit: number;
  /** null se non ci sono giocate chiuse. */
  yield: number | null;
  /** null se il capitale netto versato non è positivo. */
  roi: number | null;
  /** null se non ci sono giocate decise (esclusi VOID). */
  hitRate: number | null;
  averageOdds: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
}

const isSettled = (b: BetLike) => b.status !== "OPEN";

export function netDeposits(movements: readonly MovementLike[]): number {
  let cents = 0;
  for (const m of movements) {
    if (m.kind === "DEPOSIT") cents += toCents(m.amount);
    else if (m.kind === "WITHDRAWAL") cents -= toCents(m.amount);
  }
  return toEuros(cents);
}

export function betProfit(b: BetLike): number | null {
  if (!isSettled(b) || b.payout === null) return null;
  return toEuros(toCents(b.payout) - toCents(b.stake));
}

export function computeMetrics(
  bets: readonly BetLike[],
  movements: readonly MovementLike[] = [],
): BankrollMetrics {
  const settled = bets
    .filter(isSettled)
    .slice()
    .sort((a, b) => (a.settled_at ?? "").localeCompare(b.settled_at ?? ""));
  const open = bets.filter((b) => !isSettled(b));

  let stakedCents = 0;
  let profitCents = 0;
  let peakCents = 0;
  let drawdownCents = 0;
  let peakAtDrawdown = 0;
  let wins = 0;
  let decided = 0;
  let oddsSum = 0;

  for (const b of settled) {
    const p = toCents(b.payout ?? 0) - toCents(b.stake);
    stakedCents += toCents(b.stake);
    profitCents += p;
    oddsSum += Number(b.odds);
    if (b.status !== "VOID") {
      decided += 1;
      if (p > 0) wins += 1;
    }
    if (profitCents > peakCents) peakCents = profitCents;
    if (peakCents - profitCents > drawdownCents) {
      drawdownCents = peakCents - profitCents;
      peakAtDrawdown = peakCents;
    }
  }

  const capital = netDeposits(movements);
  const profit = toEuros(profitCents);
  const drawdownBase = toCents(capital) + peakAtDrawdown;
  return {
    bets: bets.length,
    openBets: open.length,
    settledBets: settled.length,
    openStakes: toEuros(open.reduce((acc, b) => acc + toCents(b.stake), 0)),
    staked: toEuros(stakedCents),
    profit,
    yield: stakedCents > 0 ? profitCents / stakedCents : null,
    roi: capital > 0 ? profit / capital : null,
    hitRate: decided > 0 ? wins / decided : null,
    averageOdds: settled.length > 0 ? oddsSum / settled.length : null,
    maxDrawdown: toEuros(drawdownCents),
    maxDrawdownPct: drawdownBase > 0 ? drawdownCents / drawdownBase : null,
  };
}

/** Metriche separate per giocate reali e simulate (richiede `bankroll_kind` su ogni giocata). */
export function metricsByKind(bets: readonly BetLike[]): Record<BankrollKind, BankrollMetrics> {
  return {
    REAL: computeMetrics(bets.filter((b) => b.bankroll_kind === "REAL")),
    SIMULATED: computeMetrics(bets.filter((b) => b.bankroll_kind === "SIMULATED")),
  };
}

/** Profitto cumulato dopo ogni giocata chiusa, in ordine di chiusura (per i grafici). */
export function profitCurve(bets: readonly BetLike[]): { at: string; profit: number }[] {
  let cents = 0;
  return bets
    .filter(isSettled)
    .slice()
    .sort((a, b) => (a.settled_at ?? "").localeCompare(b.settled_at ?? ""))
    .map((b) => {
      cents += toCents(b.payout ?? 0) - toCents(b.stake);
      return { at: b.settled_at ?? "", profit: toEuros(cents) };
    });
}
