/**
 * Contratto M4 — versioni dei modelli, previsioni, backtest.
 *
 * Specchia `supabase/migrations/20261108100000_predictions.sql` (verificato da
 * `supabase/tests/predictions.test.ts`). Dizionario: docs/data-dictionary/predictions.md.
 * Decisioni: ADR 0020 (versioning), 0021 (modelli e mercati), 0022 (Confidence Score).
 */
import type { IngestionRunStatus, MatchStatus } from "./football";

export const MODEL_KEYS = ["baseline", "elo", "poisson", "dixon_coles"] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];

export const MODEL_STATUSES = ["CANDIDATE", "ACTIVE", "RETIRED"] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

/** Mercati derivati dai modelli gol (ADR 0021 §2) e loro selezioni. */
export const PREDICTION_MARKETS = [
  "1X2",
  "DOUBLE_CHANCE",
  "DNB",
  "TOTAL_GOALS",
  "BTTS",
  "TEAM_GOALS",
  "CORRECT_SCORE",
  "EUROPEAN_HANDICAP",
  "ASIAN_HANDICAP",
] as const;
export type PredictionMarket = (typeof PREDICTION_MARKETS)[number];

/** Mercati che richiedono una linea (`line`). */
export const MARKETS_WITH_LINE: readonly PredictionMarket[] = [
  "TOTAL_GOALS",
  "TEAM_GOALS",
  "EUROPEAN_HANDICAP",
  "ASIAN_HANDICAP",
];

/** Selezioni ammesse per mercato; per CORRECT_SCORE anche "h-a" (es. "2-1"). */
export const PREDICTION_SELECTIONS: Readonly<Record<PredictionMarket, readonly string[]>> = {
  "1X2": ["HOME", "DRAW", "AWAY"],
  DOUBLE_CHANCE: ["HOME_DRAW", "HOME_AWAY", "DRAW_AWAY"],
  DNB: ["HOME", "AWAY"],
  TOTAL_GOALS: ["OVER", "UNDER"],
  BTTS: ["YES", "NO"],
  TEAM_GOALS: ["HOME_OVER", "HOME_UNDER", "AWAY_OVER", "AWAY_UNDER"],
  CORRECT_SCORE: ["OTHER"],
  EUROPEAN_HANDICAP: ["HOME", "DRAW", "AWAY"],
  ASIAN_HANDICAP: ["HOME", "AWAY"],
};

/** Fasce del Confidence Score (ADR 0022). */
export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";

export function confidenceBand(score: number): ConfidenceBand {
  if (score < 0.4) return "LOW";
  if (score < 0.7) return "MEDIUM";
  return "HIGH";
}

/** Pesi iniziali del Confidence Score (ADR 0022). */
export const CONFIDENCE_WEIGHTS = {
  sample: 0.3,
  calibration: 0.25,
  agreement: 0.25,
  data: 0.2,
} as const;

type Timestamp = string;
type Numeric = number;

/** Riga di `public.v_active_predictions`. */
export interface ActivePredictionRow {
  match_id: number;
  kickoff_at: Timestamp;
  match_status: MatchStatus;
  competition_id: number;
  season_id: number;
  home_team_name: string;
  away_team_name: string;
  market: PredictionMarket;
  line: Numeric | null;
  selection: string;
  probability: Numeric;
  push_probability: Numeric | null;
  confidence_score: Numeric;
  explanation: Record<string, unknown>;
  as_of: Timestamp;
  created_at: Timestamp;
  model_version_id: number;
  model_key: ModelKey;
  model_version: string;
}

/** Riga di `public.v_model_versions_summary`. */
export interface ModelVersionSummaryRow {
  model_version_id: number;
  model_key: ModelKey;
  version: string;
  status: ModelStatus;
  code_commit: string;
  training_window_start: Timestamp;
  training_window_end: Timestamp;
  training_matches: number;
  created_at: Timestamp;
  activated_at: Timestamp | null;
  backtest_id: number | null;
  backtest_window_start: Timestamp | null;
  backtest_window_end: Timestamp | null;
  backtest_matches: number | null;
  brier: Numeric | null;
  log_loss: Numeric | null;
  ece: Numeric | null;
  baseline_brier: Numeric | null;
  baseline_log_loss: Numeric | null;
  beats_baseline: boolean | null;
  calibration: {
    bin_low: number;
    bin_high: number;
    predicted: number;
    observed: number;
    count: number;
  }[];
}

/** Stato di un'esecuzione del motore (`prediction_runs.status`). */
export type PredictionRunStatus = IngestionRunStatus;
