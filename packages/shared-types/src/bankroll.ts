/**
 * Contratto M6 — bankroll, movimenti, giocate e limiti personali.
 *
 * Specchia `supabase/migrations/20261108140000_bankroll.sql` (verificato da
 * `supabase/tests/bankroll.test.ts`). Dizionario: docs/data-dictionary/bankroll.md.
 * Decisioni: ADR 0030 (dati, limiti, privacy), ADR 0031 (staking).
 * Dati personali: visibili solo al proprietario, mai agli amministratori.
 */

export const BANKROLL_KINDS = ["REAL", "SIMULATED"] as const;
export type BankrollKind = (typeof BANKROLL_KINDS)[number];

export const MOVEMENT_KINDS = ["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const BET_STATUSES = [
  "OPEN",
  "WON",
  "LOST",
  "VOID",
  "HALF_WON",
  "HALF_LOST",
  "CASHED_OUT",
] as const;
export type BetStatus = (typeof BET_STATUSES)[number];

/** Stake suggerito (ADR 0031). */
export const STAKING = {
  flatDefault: 0.01,
  flatMin: 0.001,
  flatMax: 0.05,
  kellyFraction: 0.25,
  kellyCap: 0.02,
} as const;

type Timestamp = string;
type Numeric = number;

/** Riga di `public.v_bankroll_summary`. */
export interface BankrollSummaryRow {
  bankroll_id: number;
  name: string;
  kind: BankrollKind;
  currency: "EUR";
  flat_stake_pct: Numeric;
  created_at: Timestamp;
  deposits: Numeric;
  withdrawals: Numeric;
  adjustments: Numeric;
  settled_profit: Numeric;
  open_stakes: Numeric;
  balance: Numeric;
  available: Numeric;
  open_bets: number;
  settled_bets: number;
  settled_stakes: Numeric;
}

/** Riga di `public.v_bets`. */
export interface BetRow {
  id: number;
  bankroll_id: number;
  bankroll_kind: BankrollKind;
  bankroll_name: string;
  placed_at: Timestamp;
  match_id: number | null;
  description: string | null;
  market: string;
  selection: string;
  line: Numeric | null;
  odds: Numeric;
  stake: Numeric;
  bookmaker: string | null;
  status: BetStatus;
  payout: Numeric | null;
  profit: Numeric | null;
  settled_at: Timestamp | null;
  closing_odds: Numeric | null;
  bet_proposal_id: number | null;
  model_version_id: number | null;
  model_probability: Numeric | null;
  note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Riga di `public.personal_limits`. */
export interface PersonalLimitsRow {
  bankroll_id: number;
  max_stake: Numeric | null;
  max_open_bets: number | null;
  max_daily_loss: Numeric | null;
  max_weekly_loss: Numeric | null;
  updated_at: Timestamp;
}
