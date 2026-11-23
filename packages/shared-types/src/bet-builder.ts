/**
 * Contratto M5 — Smart Bet Builder: proposte, selezioni, schedine degli utenti.
 *
 * Specchia `supabase/migrations/20261108120000_bet_builder.sql` (verificato da
 * `supabase/tests/bet-builder.test.ts`). Dizionario: docs/data-dictionary/bet-builder.md.
 * Decisioni: ADR 0025 (regole), 0026 (correlazioni), 0027 (motore, ranking, categorie).
 *
 * Le formule qui sotto sono il riferimento: il motore (Python, M5 corsia A) le
 * replica con gli stessi casi di test, come per il de-margin (ADR 0016).
 */
import type { FreshnessStatus, IngestionRunStatus, MatchStatus } from "./football";
import type { ModelKey, PredictionMarket } from "./predictions";

export const BET_PROPOSAL_KINDS = ["SINGLE", "MULTIPLE", "SAME_MATCH"] as const;
export type BetProposalKind = (typeof BET_PROPOSAL_KINDS)[number];

/** Categorie per profilo di rischio (ADR 0027 §3). */
export const BET_PROPOSAL_CATEGORIES = ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"] as const;
export type BetProposalCategory = (typeof BET_PROPOSAL_CATEGORIES)[number];

/** Soglie di una run del motore (ADR 0025 §3), salvate in `bet_builder_runs.rules`. */
export interface BetBuilderRules {
  rules_version: string;
  max_legs: number;
  max_proposals_per_category: number;
  min_leg_probability: number;
  min_probability: number;
  min_leg_expected_value: number;
  min_expected_value: number;
  min_confidence_score: number;
  /**
   * Peso del mercato nella probabilità usata per EV e soglie (ADR 0028):
   * `(1 − w)·modello + w·mercato`. Assente nelle run precedenti: 0.
   */
  market_weight?: number;
  /** Solo quote di bookmaker italiani nelle proposte (ADR 0028). Assente: false. */
  italian_bookmakers_only?: boolean;
}

/** Valori iniziali (ADR 0025): si rivedono con un nuovo ADR dopo i primi dati reali. */
/** ADR 0065: meno proposte e più solide (erano 8 per categoria, selezioni dal 20%). */
export const DEFAULT_BET_BUILDER_RULES: Readonly<BetBuilderRules> = {
  rules_version: "2026.11.23-1",
  max_legs: 4,
  max_proposals_per_category: 2,
  min_leg_probability: 0.35,
  min_probability: 0.15,
  min_leg_expected_value: 0.02,
  min_expected_value: 0.05,
  min_confidence_score: 0.4,
  market_weight: 0.5,
  italian_bookmakers_only: true,
};

/** Probabilità usata (ADR 0028): media pesata tra modello e consenso di mercato. */
export function blendedProbability(model: number, market: number, weight: number): number {
  return (1 - weight) * model + weight * market;
}

/** Limite inferiore della probabilità combinata per categoria (ADR 0027 §3). */
export const CATEGORY_MIN_PROBABILITY: Readonly<Record<BetProposalCategory, number>> = {
  CONSERVATIVE: 0.5,
  BALANCED: 0.25,
  AGGRESSIVE: 0,
};

/** Valore atteso per unità puntata: `p · quota − 1`. */
export function expectedValue(probability: number, price: number): number {
  return probability * price - 1;
}

/** Probabilità di una multipla su partite diverse: indipendenza dichiarata (ADR 0026 §2). */
export function independentProbability(probabilities: readonly number[]): number {
  return probabilities.reduce((acc, p) => acc * p, 1);
}

/** Categoria dalla probabilità combinata (ADR 0027 §3). */
export function categoryForProbability(probability: number): BetProposalCategory {
  if (probability >= CATEGORY_MIN_PROBABILITY.CONSERVATIVE) return "CONSERVATIVE";
  if (probability >= CATEGORY_MIN_PROBABILITY.BALANCED) return "BALANCED";
  return "AGGRESSIVE";
}

/**
 * Punteggio di ranking (ADR 0027 §2): `C · EV / σ`, dove `σ = quota · √(p(1 − p))`
 * è la deviazione standard del ritorno per unità puntata. Premia valore atteso e
 * Confidence Score, penalizza la varianza.
 */
export function rankScore(probability: number, price: number, confidence: number): number {
  if (!(probability > 0 && probability < 1) || !(price > 1)) {
    throw new RangeError("Probabilità in (0, 1) e quota > 1");
  }
  const sigma = price * Math.sqrt(probability * (1 - probability));
  return (confidence * expectedValue(probability, price)) / sigma;
}

type Timestamp = string;
type DateString = string;
type Numeric = number;

/** Riga di `public.v_active_bet_proposals`. */
export interface ActiveBetProposalRow {
  proposal_id: number;
  run_id: number;
  slate_date: DateString;
  category: BetProposalCategory;
  rank: number;
  rank_score: Numeric;
  kind: BetProposalKind;
  legs_count: number;
  probability: Numeric;
  combined_price: Numeric;
  expected_value: Numeric;
  confidence_score: Numeric;
  first_kickoff_at: Timestamp;
  last_kickoff_at: Timestamp;
  odds_observed_at: Timestamp;
  legs_stale: number;
  legs_price_changed: number;
  explanation: Record<string, unknown>;
  created_at: Timestamp;
  model_version_id: number;
  model_key: ModelKey;
  model_version: string;
}

/** Riga di `public.v_bet_proposal_legs`. */
export interface BetProposalLegRow {
  proposal_id: number;
  leg_no: number;
  match_id: number;
  kickoff_at: Timestamp;
  match_status: MatchStatus;
  competition_id: number;
  home_team_name: string;
  away_team_name: string;
  market: PredictionMarket;
  line: Numeric | null;
  selection: string;
  probability: Numeric;
  confidence_score: Numeric;
  bookmaker: string;
  bookmaker_title: string;
  price: Numeric;
  odds_event_time: Timestamp;
  odds_observed_at: Timestamp;
  prediction_id: number;
  odds_snapshot_id: number;
  current_price: Numeric | null;
  current_observed_at: Timestamp | null;
  current_freshness: FreshnessStatus;
}

/** Riga di `public.v_bet_builder_latest_run`. */
export interface BetBuilderLatestRunRow {
  run_id: number;
  status: IngestionRunStatus;
  triggered_by: "schedule" | "manual";
  started_at: Timestamp;
  finished_at: Timestamp | null;
  candidates_evaluated: number;
  proposals_written: number;
  rules: BetBuilderRules;
  model_version_id: number;
  model_key: ModelKey;
  model_version: string;
}

/** Riga di `public.user_bet_slips` (privata: solo il proprietario). */
export interface UserBetSlipRow {
  id: number;
  user_id: string;
  name: string;
  notes: string | null;
  source_proposal_id: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Riga di `public.user_bet_slip_selections` (privata: solo il proprietario). */
export interface UserBetSlipSelectionRow {
  id: number;
  slip_id: number;
  user_id: string;
  leg_no: number;
  match_id: number;
  market: PredictionMarket;
  line: Numeric | null;
  selection: string;
  prediction_id: number | null;
  odds_snapshot_id: number | null;
  created_at: Timestamp;
}
