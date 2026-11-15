/**
 * Contratto M2 — modello canonico del calcio.
 *
 * Specchia i tipi enum e le viste di
 * `supabase/migrations/20261107120000_football_core.sql`: ogni modifica va
 * fatta in entrambi i posti (il test `supabase/tests/football.test.ts`
 * verifica che i valori coincidano). Dizionario: docs/data-dictionary/football.md.
 */

export const QUALITY_STATUSES = ["OK", "WARNING", "ERROR"] as const;
export type QualityStatus = (typeof QUALITY_STATUSES)[number];

export const FRESHNESS_STATUSES = ["FRESH", "STALE"] as const;
export type FreshnessStatus = (typeof FRESHNESS_STATUSES)[number];

export const COMPETITION_TYPES = ["LEAGUE", "CUP", "LEAGUE_CUP", "PLAYOFFS"] as const;
export type CompetitionType = (typeof COMPETITION_TYPES)[number];

export const MATCH_STATUSES = [
  "SCHEDULED",
  "LIVE",
  "FINISHED",
  "POSTPONED",
  "SUSPENDED",
  "CANCELLED",
  "ABANDONED",
  "AWARDED",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const SCORE_DURATIONS = ["REGULAR", "EXTRA_TIME", "PENALTY_SHOOTOUT"] as const;
export type ScoreDuration = (typeof SCORE_DURATIONS)[number];

export const STANDING_TYPES = ["TOTAL", "HOME", "AWAY"] as const;
export type StandingType = (typeof STANDING_TYPES)[number];

export const FOOTBALL_ENTITY_TYPES = ["competition", "season", "team", "match"] as const;
export type FootballEntityType = (typeof FOOTBALL_ENTITY_TYPES)[number];

export const FOOTBALL_DATA_KINDS = [
  "competitions",
  "teams",
  "matches",
  "standings",
  "odds",
] as const;
export type FootballDataKind = (typeof FOOTBALL_DATA_KINDS)[number];

export const INGESTION_RUN_STATUSES = ["RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"] as const;
export type IngestionRunStatus = (typeof INGESTION_RUN_STATUSES)[number];

export const ISSUE_SEVERITIES = ["INFO", "WARNING", "ERROR"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = ["OPEN", "RESOLVED", "IGNORED"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/** Stato complessivo di un provider in `v_source_health`. */
export const SOURCE_HEALTH_STATES = ["NO_DATA", "OK", "DEGRADED"] as const;
export type SourceHealthState = (typeof SOURCE_HEALTH_STATES)[number];

/** Codici dei provider presenti nella tabella `providers`. */
export const FOOTBALL_PROVIDERS = ["football-data-org", "api-football", "the-odds-api"] as const;
export type FootballProvider = (typeof FOOTBALL_PROVIDERS)[number];

/** Stati in cui il risultato della partita è definitivo. */
export const FINAL_MATCH_STATUSES: readonly MatchStatus[] = ["FINISHED", "AWARDED"];

export function isFinalMatchStatus(status: MatchStatus): boolean {
  return FINAL_MATCH_STATUSES.includes(status);
}

// Timestamp: stringhe ISO 8601 come restituite da PostgREST.
type Timestamp = string;

/** Riga di `public.v_match_center`. */
export interface MatchCenterRow {
  match_id: number;
  kickoff_at: Timestamp;
  status: MatchStatus;
  matchday: number | null;
  stage: string | null;
  group_name: string | null;
  competition_id: number;
  competition_code: string | null;
  competition_name: string;
  area_name: string | null;
  season_id: number;
  season_label: string;
  home_team_id: number;
  home_team_name: string;
  home_team_short_name: string | null;
  home_team_tla: string | null;
  away_team_id: number;
  away_team_name: string;
  away_team_short_name: string | null;
  away_team_tla: string | null;
  home_score: number | null;
  away_score: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  score_duration: ScoreDuration | null;
  provider: FootballProvider;
  provider_name: string;
  provider_match_id: string | null;
  observed_at: Timestamp;
  event_time: Timestamp;
  quality: QualityStatus;
  freshness: FreshnessStatus;
  open_issues: number;
}

/** Riga di `public.v_match_results` (solo partite concluse con risultato). */
export interface MatchResultRow {
  match_id: number;
  competition_id: number;
  season_id: number;
  matchday: number | null;
  kickoff_at: Timestamp;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
  home_score_ht: number | null;
  away_score_ht: number | null;
  score_duration: ScoreDuration | null;
  provider: FootballProvider;
  observed_at: Timestamp;
  quality: Exclude<QualityStatus, "ERROR">;
}

/** Riga di `public.v_latest_standings`. */
export interface StandingRow {
  competition_id: number;
  competition_name: string;
  season_id: number;
  season_label: string;
  standing_type: StandingType;
  stage: string;
  group_name: string;
  position: number;
  team_id: number;
  team_name: string;
  team_tla: string | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  provider: FootballProvider;
  observed_at: Timestamp;
  event_time: Timestamp;
  quality: QualityStatus;
  freshness: FreshnessStatus;
}

/** Riga di `public.v_source_health`. */
export interface SourceHealthRow {
  provider: FootballProvider;
  name: string;
  website: string;
  terms_verified_at: string | null;
  attribution: string | null;
  last_run_status: IngestionRunStatus | null;
  last_run_at: Timestamp | null;
  last_error: string | null;
  quota_remaining: number | null;
  last_success_at: Timestamp | null;
  runs_24h: number;
  failed_runs_24h: number;
  requests_24h: number;
  open_issues: number;
  open_errors: number;
  freshness: FreshnessStatus | null;
  health: SourceHealthState;
}

/** Ruoli nelle formazioni di API-Football (`pos`): portiere, difensore, centrocampista, attaccante. */
export const LINEUP_POSITIONS = ["G", "D", "M", "F"] as const;
export type LineupPosition = (typeof LINEUP_POSITIONS)[number];

/** Riga di `match_team_statistics` (ADR 0012): una voce statistica per squadra e partita. */
export interface MatchTeamStatisticRow {
  match_id: number;
  team_id: number;
  provider: FootballProvider;
  provider_match_id: string;
  /** Nome della voce del provider in snake_case, es. `shots_on_goal`, `passes_pct`. */
  stat: string;
  /** Numero; le percentuali sono 0–100. `null` se il provider non ha il dato. */
  value: number | null;
  observed_at: string;
  event_time: string;
  quality: QualityStatus;
}

/** Riga di `match_lineups` (ADR 0012). */
export interface MatchLineupRow {
  match_id: number;
  team_id: number;
  provider: FootballProvider;
  provider_match_id: string;
  formation: string | null;
  coach_provider_id: string | null;
  coach_name: string | null;
  observed_at: string;
  event_time: string;
  quality: QualityStatus;
}

/** Riga di `match_lineup_players` (ADR 0012). */
export interface MatchLineupPlayerRow {
  match_id: number;
  team_id: number;
  provider: FootballProvider;
  player_provider_id: string;
  player_name: string;
  shirt_number: number | null;
  position: LineupPosition | null;
  grid: string | null;
  is_starter: boolean;
}
