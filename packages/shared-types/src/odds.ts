/**
 * Contratto M3 — quote, margine e statistiche.
 *
 * Specchia `supabase/migrations/20261107140100_odds_core.sql` (verificato da
 * `supabase/tests/odds.test.ts`). Dizionario: docs/data-dictionary/odds.md.
 * Decisioni: ADR 0015 (quote v1), ADR 0016 (de-margin).
 */
import type { FreshnessStatus, QualityStatus } from "./football";

/** Mercati della v1 e loro selezioni canoniche. */
export const ODDS_MARKETS = { h2h: ["HOME", "DRAW", "AWAY"] } as const;
export type OddsMarket = keyof typeof ODDS_MARKETS;
export type H2hSelection = (typeof ODDS_MARKETS)["h2h"][number];

/** Chiavi The Odds API delle competizioni della v1 (ADR 0015 §1), per codice football-data.org. */
export const ODDS_SPORT_KEYS = {
  SA: "soccer_italy_serie_a",
  PL: "soccer_epl",
  PD: "soccer_spain_la_liga",
  BL1: "soccer_germany_bundesliga",
  FL1: "soccer_france_ligue_one",
  DED: "soccer_netherlands_eredivisie",
  PPL: "soccer_portugal_primeira_liga",
  CL: "soccer_uefa_champs_league",
} as const;
export type OddsCompetitionCode = keyof typeof ODDS_SPORT_KEYS;

type Timestamp = string;
/** Valori `numeric` di Postgres: PostgREST li restituisce come numero. */
type Numeric = number;

/** Riga di `public.v_match_odds_h2h`: 1X2 di un bookmaker con margine e probabilità implicite. */
export interface MatchOddsH2hRow {
  event_id: number;
  match_id: number | null;
  competition_id: number | null;
  commence_time: Timestamp;
  home_team_name: string;
  away_team_name: string;
  bookmaker: string;
  bookmaker_title: string;
  italian_market: boolean;
  home_price: Numeric;
  draw_price: Numeric;
  away_price: Numeric;
  /** Somma delle probabilità implicite meno 1 (es. 0.0441 = 4,41%). */
  overround: Numeric;
  /** Probabilità senza margine, metodo proporzionale (ADR 0016). */
  home_probability: Numeric;
  draw_probability: Numeric;
  away_probability: Numeric;
  provider: string;
  observed_at: Timestamp;
  event_time: Timestamp;
  quality: QualityStatus;
  freshness: FreshnessStatus;
}

/** Riga di `public.v_best_odds_h2h` (solo bookmaker con quote FRESH). */
export interface BestOddsH2hRow {
  event_id: number;
  match_id: number | null;
  competition_id: number | null;
  commence_time: Timestamp;
  home_team_name: string;
  away_team_name: string;
  best_home_price: Numeric;
  best_home_bookmaker: string;
  best_draw_price: Numeric;
  best_draw_bookmaker: string;
  best_away_price: Numeric;
  best_away_bookmaker: string;
  bookmakers: number;
  italian_bookmakers: number;
  observed_at: Timestamp;
}

/** Riga di `public.v_odds_coverage`. */
export interface OddsCoverageRow {
  competition_id: number;
  competition_code: string | null;
  competition_name: string;
  events: number;
  matched_events: number;
  bookmakers: number;
  italian_bookmakers: number;
  last_observed_at: Timestamp | null;
}

/** Riga di `public.v_team_season_stats` (solo partite concluse di `v_match_results`). */
export interface TeamSeasonStatsRow {
  season_id: number;
  competition_id: number;
  team_id: number;
  team_name: string;
  team_tla: string | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
  home_played: number;
  home_won: number;
  home_goals_for: number;
  home_goals_against: number;
  away_played: number;
  away_won: number;
  away_goals_for: number;
  away_goals_against: number;
  clean_sheets: number;
  both_scored: number;
  over_2_5: number;
}

/** Riga di `public.v_team_form`: ultimi 5 risultati, dal più recente (V/N/P). */
export interface TeamFormRow {
  season_id: number;
  team_id: number;
  form: string;
  last_match_at: Timestamp;
}

/** Riga di `public.v_league_season_stats`. */
export interface LeagueSeasonStatsRow {
  season_id: number;
  competition_id: number;
  matches: number;
  avg_goals: Numeric;
  avg_home_goals: Numeric;
  avg_away_goals: Numeric;
  home_win_rate: Numeric;
  draw_rate: Numeric;
  away_win_rate: Numeric;
  over_2_5_rate: Numeric;
  both_scored_rate: Numeric;
  first_match_at: Timestamp;
  last_match_at: Timestamp;
}
