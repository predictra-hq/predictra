import "server-only";
import type {
  IngestionRunStatus,
  IssueSeverity,
  MatchCenterRow,
  SourceHealthRow,
} from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";
import { sortCompetitions } from "./format";

/*
 * Letture lato server sulle viste del contratto M2 (docs/data-dictionary/football.md).
 * Usano il client con la sessione dell'utente: la RLS consente la lettura solo
 * agli utenti attivi. Le pagine chiamano prima `requireUser()`.
 */

export class FootballDataUnavailable extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Lettura non riuscita: ${what}`, { cause });
  }
}

export interface CompetitionOption {
  id: number;
  code: string | null;
  name: string;
}

export interface SeasonInfo {
  id: number;
  label: string;
  currentMatchday: number | null;
  maxMatchday: number | null;
}

export interface IngestionRunRow {
  id: number;
  provider: string;
  job_type: string;
  window_key: string;
  status: IngestionRunStatus;
  started_at: string;
  finished_at: string | null;
  requests_used: number;
  rows_upserted: number;
  error_count: number;
  error_summary: string | null;
}

export interface QualityIssueRow {
  id: number;
  provider: string | null;
  entity_type: string | null;
  entity_id: number | null;
  provider_entity_id: string | null;
  check_code: string;
  severity: IssueSeverity;
  last_seen_at: string;
}

export interface CoverageRow {
  competitionId: number;
  code: string | null;
  name: string;
  areaName: string | null;
  seasonLabel: string | null;
  matches: number;
}

const MATCH_COLUMNS = "*";

export async function listCompetitions(): Promise<CompetitionOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("competitions").select("id, code, name");
  if (error) throw new FootballDataUnavailable("competizioni", error);
  return sortCompetitions((data ?? []) as CompetitionOption[]);
}

/** Stagione più recente della competizione, con giornata corrente e ultima giornata. */
export async function getCurrentSeason(competitionId: number): Promise<SeasonInfo | null> {
  const supabase = await createClient();
  const { data: season, error } = await supabase
    .from("seasons")
    .select("id, label, current_matchday")
    .eq("competition_id", competitionId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new FootballDataUnavailable("stagione", error);
  if (!season) return null;

  const { data: last, error: lastError } = await supabase
    .from("matches")
    .select("matchday")
    .eq("season_id", season.id)
    .not("matchday", "is", null)
    .order("matchday", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw new FootballDataUnavailable("giornate", lastError);

  return {
    id: Number(season.id),
    label: String(season.label),
    currentMatchday: (season.current_matchday as number | null) ?? null,
    maxMatchday: (last?.matchday as number | null | undefined) ?? null,
  };
}

export async function listMatches(
  seasonId: number,
  matchday: number | "all",
): Promise<MatchCenterRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("v_match_center")
    .select(MATCH_COLUMNS)
    .eq("season_id", seasonId)
    .order("kickoff_at", { ascending: true })
    .order("match_id", { ascending: true })
    .limit(500);
  if (matchday !== "all") query = query.eq("matchday", matchday);
  const { data, error } = await query;
  if (error) throw new FootballDataUnavailable("partite", error);
  return (data ?? []) as MatchCenterRow[];
}

export async function getMatch(matchId: number): Promise<{
  match: MatchCenterRow | null;
  issues: QualityIssueRow[];
  attribution: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_match_center")
    .select(MATCH_COLUMNS)
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) throw new FootballDataUnavailable("partita", error);
  if (!data) return { match: null, issues: [], attribution: null };
  const match = data as MatchCenterRow;

  const [{ data: issues, error: issuesError }, { data: provider }] = await Promise.all([
    supabase
      .from("data_quality_issues")
      .select(
        "id, provider, entity_type, entity_id, provider_entity_id, check_code, severity, last_seen_at",
      )
      .eq("status", "OPEN")
      .eq("entity_type", "match")
      .eq("entity_id", matchId)
      .order("last_seen_at", { ascending: false }),
    supabase.from("providers").select("attribution").eq("code", match.provider).maybeSingle(),
  ]);
  if (issuesError) throw new FootballDataUnavailable("problemi di qualità", issuesError);
  return {
    match,
    issues: (issues ?? []) as QualityIssueRow[],
    attribution: (provider?.attribution as string | null | undefined) ?? null,
  };
}

export async function getSourceHealth(): Promise<SourceHealthRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_source_health").select("*").order("provider");
  if (error) throw new FootballDataUnavailable("stato delle fonti", error);
  return (data ?? []) as SourceHealthRow[];
}

export async function listRecentRuns(limit = 30): Promise<IngestionRunRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingestion_runs")
    .select(
      "id, provider, job_type, window_key, status, started_at, finished_at, requests_used, rows_upserted, error_count, error_summary",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new FootballDataUnavailable("raccolte", error);
  return (data ?? []) as IngestionRunRow[];
}

export async function listOpenIssues(limit = 100): Promise<QualityIssueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_quality_issues")
    .select(
      "id, provider, entity_type, entity_id, provider_entity_id, check_code, severity, last_seen_at",
    )
    .eq("status", "OPEN")
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new FootballDataUnavailable("problemi di qualità", error);
  return (data ?? []) as QualityIssueRow[];
}

/** Competizioni caricate con la stagione più recente e il numero di partite. */
export async function listCoverage(): Promise<CoverageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    // Chiavi esterne esplicite: matches e standings collegano sia competizioni sia stagioni.
    .select(
      "id, code, name, area_name, seasons!seasons_competition_id_fkey(id, label, start_date, matches!matches_season_id_fkey(count))",
    );
  if (error) throw new FootballDataUnavailable("copertura", error);

  type Raw = {
    id: number;
    code: string | null;
    name: string;
    area_name: string | null;
    seasons: { id: number; label: string; start_date: string; matches: { count: number }[] }[];
  };
  const rows = ((data ?? []) as Raw[]).map((c) => {
    const latest = [...(c.seasons ?? [])].sort((a, b) =>
      b.start_date.localeCompare(a.start_date),
    )[0];
    return {
      competitionId: c.id,
      code: c.code,
      name: c.name,
      areaName: c.area_name,
      seasonLabel: latest?.label ?? null,
      matches: latest?.matches?.[0]?.count ?? 0,
    };
  });
  return sortCompetitions(rows);
}
