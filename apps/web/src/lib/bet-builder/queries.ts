import "server-only";
import type {
  ActivePredictionRow,
  ActiveBetProposalRow,
  BetBuilderLatestRunRow,
  BetProposalKind,
  BetProposalLegRow,
  FreshnessStatus,
  MatchOddsH2hRow,
  UserBetSlipRow,
  UserBetSlipSelectionRow,
} from "@predictra/shared-types";
import { DEFAULT_BET_BUILDER_RULES } from "@predictra/shared-types";
import { LIKELY_MARKETS, type LatestOddsRow, type LikelyRow } from "./likely";
import { matchMarkets, type Outcome, usedProbability } from "./market";
import { createClient } from "@/lib/supabase/server";
import type { ManualSelection } from "./evaluate";
import type { MatchScore, PastProposal, ResultLeg } from "./results";

/*
 * Letture lato server sul contratto M5 (docs/data-dictionary/bet-builder.md),
 * con la sessione dell'utente: la RLS consente le proposte agli utenti attivi e
 * le schedine solo al proprietario. Le pagine chiamano prima `requireUser()`.
 */

export class BetBuilderDataUnavailable extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Lettura non riuscita: ${what}`, { cause });
  }
}

const MANUAL_HORIZON_DAYS = 10;

export async function getLatestRun(): Promise<BetBuilderLatestRunRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_bet_builder_latest_run").select("*").maybeSingle();
  if (error) throw new BetBuilderDataUnavailable("ultima elaborazione", error);
  return (data as BetBuilderLatestRunRow | null) ?? null;
}

export async function listActiveProposals(): Promise<ActiveBetProposalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_active_bet_proposals")
    .select("*")
    .order("slate_date")
    .order("category")
    .order("rank");
  if (error) throw new BetBuilderDataUnavailable("proposte", error);
  return (data ?? []) as ActiveBetProposalRow[];
}

export async function listProposalLegs(proposalIds: number[]): Promise<BetProposalLegRow[]> {
  if (proposalIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_bet_proposal_legs")
    .select("*")
    .in("proposal_id", proposalIds)
    .order("proposal_id")
    .order("leg_no");
  if (error) throw new BetBuilderDataUnavailable("selezioni delle proposte", error);
  return (data ?? []) as BetProposalLegRow[];
}

export interface ProposalDetail {
  id: number;
  run_id: number;
  kind: BetProposalKind;
  category: ActiveBetProposalRow["category"];
  slate_date: string;
  rank: number;
  rank_score: number;
  legs_count: number;
  probability: number;
  combined_price: number;
  expected_value: number;
  confidence_score: number;
  first_kickoff_at: string;
  odds_observed_at: string;
  explanation: Record<string, unknown>;
  created_at: string;
  model_key: string;
  model_version: string;
  rules_version: string | null;
}

/** Una proposta qualsiasi (anche non più attiva): le proposte sono immutabili. */
export async function getProposal(id: number): Promise<ProposalDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bet_proposals")
    .select(
      "id, run_id, kind, category, slate_date, rank, rank_score, legs_count, probability, combined_price, expected_value, confidence_score, first_kickoff_at, odds_observed_at, explanation, created_at, model_versions(model_key, version), bet_builder_runs(rules)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new BetBuilderDataUnavailable("proposta", error);
  if (!data) return null;
  const row = data as unknown as Omit<
    ProposalDetail,
    "model_key" | "model_version" | "rules_version"
  > & {
    model_versions: { model_key: string; version: string } | null;
    bet_builder_runs: { rules: { rules_version?: string } } | null;
  };
  const { model_versions: mv, bet_builder_runs: run, ...rest } = row;
  return {
    ...rest,
    model_key: mv?.model_key ?? "—",
    model_version: mv?.version ?? "—",
    rules_version: run?.rules?.rules_version ?? null,
  };
}

/** Opzioni per la costruzione manuale: 1X2 del modello attivo e migliori quote FRESH. */
export interface ManualOption {
  matchId: number;
  competitionId: number;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  modelKey: string;
  modelVersion: string;
  outcomes: ManualSelection[];
}

/**
 * Previsioni 1X2 attive delle partite in programma nei prossimi giorni, con le
 * migliori quote FRESH (`v_best_odds_h2h` considera solo bookmaker con quote fresche).
 */
export async function listManualOptions(now: Date, matchIds?: number[]): Promise<ManualOption[]> {
  const supabase = await createClient();
  const end = new Date(now.getTime() + MANUAL_HORIZON_DAYS * 86_400_000);
  let query = supabase
    .from("v_active_predictions")
    .select(
      "match_id, competition_id, kickoff_at, match_status, home_team_name, away_team_name, selection, probability, confidence_score, model_key, model_version",
    )
    .eq("market", "1X2")
    .order("kickoff_at")
    .order("match_id");
  if (matchIds) {
    if (matchIds.length === 0) return [];
    query = query.in("match_id", matchIds);
  } else {
    query = query
      .eq("match_status", "SCHEDULED")
      .gt("kickoff_at", now.toISOString())
      .lt("kickoff_at", end.toISOString());
  }
  const { data, error } = await query;
  if (error) throw new BetBuilderDataUnavailable("previsioni", error);
  const predictions = (data ?? []) as Pick<
    ActivePredictionRow,
    | "match_id"
    | "competition_id"
    | "kickoff_at"
    | "home_team_name"
    | "away_team_name"
    | "selection"
    | "probability"
    | "confidence_score"
    | "model_key"
    | "model_version"
  >[];
  const ids = [...new Set(predictions.map((p) => p.match_id))];
  // ADR 0028: consenso da tutti i bookmaker, quota giocabile solo italiana.
  let oddsRows: MatchOddsH2hRow[] = [];
  if (ids.length > 0) {
    const odds = await supabase
      .from("v_match_odds_h2h")
      .select(
        "match_id, bookmaker, italian_market, home_price, draw_price, away_price, home_probability, draw_probability, away_probability, observed_at, freshness, quality",
      )
      .in("match_id", ids)
      .limit(5000);
    if (odds.error) throw new BetBuilderDataUnavailable("quote", odds.error);
    oddsRows = (odds.data ?? []) as MatchOddsH2hRow[];
  }
  const markets = matchMarkets(oddsRows);
  const weight = DEFAULT_BET_BUILDER_RULES.market_weight ?? 0;

  const options = new Map<number, ManualOption>();
  for (const p of predictions) {
    let option = options.get(p.match_id);
    if (!option) {
      option = {
        matchId: p.match_id,
        competitionId: p.competition_id,
        kickoffAt: p.kickoff_at,
        homeTeam: p.home_team_name,
        awayTeam: p.away_team_name,
        modelKey: p.model_key,
        modelVersion: p.model_version,
        outcomes: [],
      };
      options.set(p.match_id, option);
    }
    const market = markets.get(p.match_id);
    const outcome = p.selection as Outcome;
    const price = market?.italian[outcome]?.price ?? null;
    const freshness: FreshnessStatus | null = price === null ? null : "FRESH";
    option.outcomes.push({
      matchId: p.match_id,
      homeTeam: p.home_team_name,
      awayTeam: p.away_team_name,
      kickoffAt: p.kickoff_at,
      selection: p.selection,
      probability: usedProbability(Number(p.probability), market?.consensus[outcome], weight),
      confidence: Number(p.confidence_score),
      price: price === null ? null : Number(price),
      freshness,
    });
  }
  const order = ["HOME", "DRAW", "AWAY"];
  for (const o of options.values()) {
    o.outcomes.sort((a, b) => order.indexOf(a.selection) - order.indexOf(b.selection));
  }
  return [...options.values()];
}

export interface MatchInfo {
  match_id: number;
  kickoff_at: string;
  status: string;
  home_team_name: string;
  away_team_name: string;
}

export async function listMatches(matchIds: number[]): Promise<Map<number, MatchInfo>> {
  if (matchIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_match_center")
    .select("match_id, kickoff_at, status, home_team_name, away_team_name")
    .in("match_id", matchIds);
  if (error) throw new BetBuilderDataUnavailable("partite", error);
  return new Map(((data ?? []) as MatchInfo[]).map((m) => [m.match_id, m]));
}

export type SlipWithSelections = UserBetSlipRow & { selections: UserBetSlipSelectionRow[] };

/** Schedine dell'utente corrente (la RLS restituisce solo le sue). */
export async function listSlips(): Promise<SlipWithSelections[]> {
  const supabase = await createClient();
  const [slips, selections] = await Promise.all([
    supabase.from("user_bet_slips").select("*").order("created_at", { ascending: false }),
    supabase.from("user_bet_slip_selections").select("*").order("slip_id").order("leg_no"),
  ]);
  if (slips.error) throw new BetBuilderDataUnavailable("schedine", slips.error);
  if (selections.error) throw new BetBuilderDataUnavailable("selezioni", selections.error);
  const bySlip = new Map<number, UserBetSlipSelectionRow[]>();
  for (const s of (selections.data ?? []) as UserBetSlipSelectionRow[]) {
    bySlip.set(s.slip_id, [...(bySlip.get(s.slip_id) ?? []), s]);
  }
  return ((slips.data ?? []) as UserBetSlipRow[]).map((s) => ({
    ...s,
    selections: bySlip.get(s.id) ?? [],
  }));
}

/**
 * Previsioni del modello attivo per "Le più probabili": partite in programma nei prossimi
 * giorni, solo i mercati e le linee ammessi (`LIKELY_MARKETS`).
 */
export async function listLikelyRows(now: Date): Promise<LikelyRow[]> {
  const supabase = await createClient();
  const end = new Date(now.getTime() + MANUAL_HORIZON_DAYS * 86_400_000);
  const { data, error } = await supabase
    .from("v_active_predictions")
    .select(
      "match_id, kickoff_at, home_team_name, away_team_name, market, line, selection, probability, confidence_score",
    )
    .in("market", Object.keys(LIKELY_MARKETS))
    .eq("match_status", "SCHEDULED")
    .gt("kickoff_at", now.toISOString())
    .lt("kickoff_at", end.toISOString())
    .limit(10000);
  if (error) throw new BetBuilderDataUnavailable("previsioni", error);
  return (data ?? []) as LikelyRow[];
}

/**
 * Ultime quote dei bookmaker italiani (1X2 e under/over) per le partite indicate, per
 * affiancare la quota reale ai pronostici più probabili (ADR 0028, 0029).
 */
export async function listItalianLatestOdds(matchIds: readonly number[]): Promise<LatestOddsRow[]> {
  if (matchIds.length === 0) return [];
  const supabase = await createClient();
  const books = await supabase.from("bookmakers").select("code, title").eq("italian_market", true);
  if (books.error) throw new BetBuilderDataUnavailable("bookmaker", books.error);
  const titles = new Map((books.data ?? []).map((b) => [String(b.code), String(b.title)]));
  const codes = [...titles.keys()];
  if (codes.length === 0) return [];
  const { data, error } = await supabase
    .from("v_latest_odds")
    .select("match_id, bookmaker, market, selection, price, observed_at")
    .in("match_id", matchIds as number[])
    .in("bookmaker", codes)
    .or("market.eq.h2h,market.eq.double_chance,market.like.totals_*")
    .eq("quality", "OK")
    .limit(10000);
  if (error) throw new BetBuilderDataUnavailable("quote italiane", error);
  // Nome leggibile del bookmaker (es. "Unibet (IT)") al posto del codice.
  return ((data ?? []) as LatestOddsRow[]).map((r) => ({
    ...r,
    bookmaker: titles.get(r.bookmaker) ?? r.bookmaker,
  }));
}

/** Proposte passate lette per il riepilogo dei risultati: le più recenti. */
const PAST_PROPOSALS_LIMIT = 300;

/**
 * Proposte la cui ultima partita è già iniziata, con le selezioni e i risultati reali
 * delle partite concluse (`v_match_results`). L'esito lo calcola `results.ts`.
 */
export async function listPastProposals(
  now: Date,
): Promise<{ proposals: PastProposal[]; scores: Map<number, MatchScore> }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bet_proposals")
    .select("id, category, created_at, last_kickoff_at, probability, combined_price")
    .lt("last_kickoff_at", now.toISOString())
    .order("last_kickoff_at", { ascending: false })
    .limit(PAST_PROPOSALS_LIMIT);
  if (error) throw new BetBuilderDataUnavailable("proposte passate", error);
  const rows = (data ?? []) as Omit<PastProposal, "legs">[];
  if (rows.length === 0) return { proposals: [], scores: new Map() };

  const legs = await supabase
    .from("bet_proposal_legs")
    .select("proposal_id, match_id, market, line, selection")
    .in("proposal_id", rows.map((r) => r.id))
    .limit(5000);
  if (legs.error) throw new BetBuilderDataUnavailable("selezioni delle proposte", legs.error);
  const legRows = (legs.data ?? []) as (ResultLeg & { proposal_id: number })[];
  const legsBy = new Map<number, ResultLeg[]>();
  for (const l of legRows) {
    legsBy.set(Number(l.proposal_id), [
      ...(legsBy.get(Number(l.proposal_id)) ?? []),
      {
        match_id: Number(l.match_id),
        market: l.market,
        line: l.line === null ? null : Number(l.line),
        selection: l.selection,
      },
    ]);
  }

  const matchIds = [...new Set(legRows.map((l) => Number(l.match_id)))];
  const results = await supabase
    .from("v_match_results")
    .select("match_id, home_score, away_score")
    .in("match_id", matchIds)
    .limit(5000);
  if (results.error) throw new BetBuilderDataUnavailable("risultati", results.error);
  const scores = new Map<number, MatchScore>();
  for (const r of results.data ?? []) {
    if (r.home_score === null || r.away_score === null) continue;
    scores.set(Number(r.match_id), { home: Number(r.home_score), away: Number(r.away_score) });
  }

  return {
    proposals: rows.map((r) => ({
      ...r,
      id: Number(r.id),
      probability: Number(r.probability),
      combined_price: Number(r.combined_price),
      legs: legsBy.get(Number(r.id)) ?? [],
    })),
    scores,
  };
}
