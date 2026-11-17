import "server-only";
import type {
  BestOddsH2hRow,
  LeagueSeasonStatsRow,
  MatchOddsH2hRow,
  OddsCoverageRow,
  StandingRow,
  TeamFormRow,
  TeamSeasonStatsRow,
} from "@predictra/shared-types";
import { sortCompetitions } from "@/lib/football/format";
import { createClient } from "@/lib/supabase/server";
import type { OddsPoint } from "./movement";
import { parsePgInterval } from "./format";

/*
 * Letture lato server sulle viste del contratto M3 (docs/data-dictionary/odds.md)
 * e su quelle di M2 per classifiche e stagioni. Client con la sessione
 * dell'utente: la RLS consente la lettura solo agli utenti attivi. Le pagine
 * chiamano prima `requireUser()` (o `requirePermission()`).
 */

export const ODDS_PROVIDER = "the-odds-api";
export const FOOTBALL_PROVIDER = "football-data-org";

export class OddsDataUnavailable extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Lettura non riuscita: ${what}`, { cause });
  }
}

export interface ProviderInfo {
  code: string;
  name: string;
  attribution: string | null;
  termsVerifiedAt: string | null;
}

export async function getProvider(code: string): Promise<ProviderInfo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .select("code, name, attribution, terms_verified_at")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new OddsDataUnavailable("fonte", error);
  if (!data) return null;
  return {
    code: String(data.code),
    name: String(data.name),
    attribution: (data.attribution as string | null) ?? null,
    termsVerifiedAt: (data.terms_verified_at as string | null) ?? null,
  };
}

/** Soglia di freschezza delle quote in millisecondi (`source_freshness_rules`, ADR 0015). */
export async function getOddsMaxAge(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_freshness_rules")
    .select("max_age")
    .eq("provider", ODDS_PROVIDER)
    .eq("data_kind", "odds")
    .maybeSingle();
  if (error) throw new OddsDataUnavailable("soglia di freschezza", error);
  return parsePgInterval((data?.max_age as string | null | undefined) ?? null);
}

/** Copertura reale delle quote per competizione, nell'ordine della v1. */
export async function listOddsCoverage(): Promise<OddsCoverageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_odds_coverage").select("*");
  if (error) throw new OddsDataUnavailable("copertura delle quote", error);
  const rows = ((data ?? []) as OddsCoverageRow[]).map((r) => ({
    ...r,
    code: r.competition_code,
    name: r.competition_name,
  }));
  return sortCompetitions(rows);
}

/** Codici dei mercati presenti nel catalogo `markets` (in v1 solo `h2h`). */
export async function listCollectedMarkets(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("markets").select("code");
  if (error) throw new OddsDataUnavailable("mercati", error);
  return new Set((data ?? []).map((r: { code: unknown }) => String(r.code)));
}

/** Margine di tolleranza: si mostrano anche gli eventi iniziati da poco. */
const RECENT_KICKOFF_MS = 3 * 3_600_000;

/**
 * 1X2 per evento e bookmaker di una competizione, solo eventi non ancora
 * iniziati (o iniziati nelle ultime 3 ore). Una riga per bookmaker.
 */
export async function listMatchOdds(
  competitionId: number,
  now: Date = new Date(),
): Promise<MatchOddsH2hRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_match_odds_h2h")
    .select("*")
    .eq("competition_id", competitionId)
    .gte("commence_time", new Date(now.getTime() - RECENT_KICKOFF_MS).toISOString())
    .order("commence_time", { ascending: true })
    .order("event_id", { ascending: true })
    .limit(1000);
  if (error) throw new OddsDataUnavailable("quote", error);
  return (data ?? []) as MatchOddsH2hRow[];
}

/** Migliori quote (solo bookmaker con quote fresche) per gli eventi indicati. */
export async function listBestOdds(eventIds: readonly number[]): Promise<BestOddsH2hRow[]> {
  if (eventIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_best_odds_h2h")
    .select("*")
    .in("event_id", eventIds as number[]);
  if (error) throw new OddsDataUnavailable("migliori quote", error);
  return (data ?? []) as BestOddsH2hRow[];
}

export interface CompetitionSeason {
  competitionId: number;
  code: string | null;
  name: string;
  areaName: string | null;
  seasonId: number | null;
  seasonLabel: string | null;
}

/** Competizioni con la stagione più recente, nell'ordine della v1. */
export async function listCompetitionSeasons(): Promise<CompetitionSeason[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    .select(
      "id, code, name, area_name, seasons!seasons_competition_id_fkey(id, label, start_date)",
    );
  if (error) throw new OddsDataUnavailable("competizioni", error);
  type Raw = {
    id: number;
    code: string | null;
    name: string;
    area_name: string | null;
    seasons: { id: number; label: string; start_date: string }[] | null;
  };
  const rows = ((data ?? []) as Raw[]).map((c) => {
    const latest = [...(c.seasons ?? [])].sort((a, b) =>
      b.start_date.localeCompare(a.start_date),
    )[0];
    return {
      competitionId: Number(c.id),
      code: c.code,
      name: c.name,
      areaName: c.area_name,
      seasonId: latest ? Number(latest.id) : null,
      seasonLabel: latest?.label ?? null,
    };
  });
  return sortCompetitions(rows);
}

export async function listTeamSeasonStats(seasonId: number): Promise<TeamSeasonStatsRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_team_season_stats")
    .select("*")
    .eq("season_id", seasonId)
    .limit(200);
  if (error) throw new OddsDataUnavailable("statistiche di squadra", error);
  return (data ?? []) as TeamSeasonStatsRow[];
}

export async function listTeamForm(seasonId: number): Promise<Map<number, TeamFormRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_team_form")
    .select("*")
    .eq("season_id", seasonId)
    .limit(200);
  if (error) throw new OddsDataUnavailable("forma recente", error);
  return new Map(((data ?? []) as TeamFormRow[]).map((r) => [Number(r.team_id), r]));
}

export interface ResultsProvenance {
  matches: number;
  lastMatchAt: string | null;
  lastObservedAt: string | null;
  providers: string[];
}

/** Partite concluse usate dalle statistiche di una stagione e loro provenienza. */
export async function getResultsProvenance(seasonId: number): Promise<ResultsProvenance> {
  const supabase = await createClient();
  const results = () => supabase.from("v_match_results");
  const [counted, lastObserved, lastMatch] = await Promise.all([
    results().select("match_id", { count: "exact", head: true }).eq("season_id", seasonId),
    results()
      .select("observed_at, provider")
      .eq("season_id", seasonId)
      .order("observed_at", { ascending: false })
      .limit(1),
    results()
      .select("kickoff_at")
      .eq("season_id", seasonId)
      .order("kickoff_at", { ascending: false })
      .limit(1),
  ]);
  const failed = counted.error ?? lastObserved.error ?? lastMatch.error;
  if (failed) throw new OddsDataUnavailable("partite concluse", failed);
  const observed = lastObserved.data?.[0] as { observed_at: string; provider: string } | undefined;
  const kickoff = lastMatch.data?.[0] as { kickoff_at: string } | undefined;
  return {
    matches: counted.count ?? 0,
    lastMatchAt: kickoff?.kickoff_at ?? null,
    lastObservedAt: observed?.observed_at ?? null,
    providers: observed ? [observed.provider] : [],
  };
}

export async function listLeagueSeasonStats(
  seasonIds: readonly number[],
): Promise<Map<number, LeagueSeasonStatsRow>> {
  if (seasonIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_league_season_stats")
    .select("*")
    .in("season_id", seasonIds as number[]);
  if (error) throw new OddsDataUnavailable("statistiche di lega", error);
  return new Map(((data ?? []) as LeagueSeasonStatsRow[]).map((r) => [Number(r.season_id), r]));
}

/** Ultima classifica della stagione (solo TOTAL), in ordine di fase, girone e posizione. */
export async function listLatestStandings(seasonId: number): Promise<StandingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_latest_standings")
    .select("*")
    .eq("season_id", seasonId)
    .eq("standing_type", "TOTAL")
    .order("stage", { ascending: true })
    .order("group_name", { ascending: true })
    .order("position", { ascending: true })
    .limit(500);
  if (error) throw new OddsDataUnavailable("classifica", error);
  return (data ?? []) as StandingRow[];
}

/**
 * Storico delle quote 1X2 di una partita: ogni variazione raccolta, per bookmaker.
 * Serve al riquadro "Movimento delle quote" del dettaglio partita.
 */
export async function listMatchOddsHistory(matchId: number): Promise<OddsPoint[]> {
  const supabase = await createClient();
  const { data: events, error: eventsError } = await supabase
    .from("odds_events")
    .select("id")
    .eq("match_id", matchId)
    .limit(5);
  if (eventsError) throw new OddsDataUnavailable("eventi di quote", eventsError);
  const ids = (events ?? []).map((e) => Number(e.id));
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("odds_snapshots")
    .select("bookmaker, selection, price, event_time")
    .in("event_id", ids)
    .eq("market", "h2h")
    .eq("quality", "OK")
    .order("event_time", { ascending: true })
    .limit(3000);
  if (error) throw new OddsDataUnavailable("storico delle quote", error);
  return (data ?? []).map((r) => ({
    bookmaker: String(r.bookmaker),
    selection: String(r.selection),
    price: Number(r.price),
    at: String(r.event_time),
  }));
}
