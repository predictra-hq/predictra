import "server-only";
import type {
  ActivePredictionRow,
  ActiveBetProposalRow,
  BestOddsH2hRow,
  BetBuilderLatestRunRow,
  BetProposalKind,
  BetProposalLegRow,
  FreshnessStatus,
  UserBetSlipRow,
  UserBetSlipSelectionRow,
} from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";
import type { ManualSelection } from "./evaluate";

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

const MANUAL_HORIZON_DAYS = 7;

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

function bestPrice(row: BestOddsH2hRow | undefined, selection: string) {
  if (!row) return { price: null, bookmaker: null };
  if (selection === "HOME")
    return { price: row.best_home_price, bookmaker: row.best_home_bookmaker };
  if (selection === "DRAW")
    return { price: row.best_draw_price, bookmaker: row.best_draw_bookmaker };
  return { price: row.best_away_price, bookmaker: row.best_away_bookmaker };
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
  let best: BestOddsH2hRow[] = [];
  if (ids.length > 0) {
    const odds = await supabase.from("v_best_odds_h2h").select("*").in("match_id", ids);
    if (odds.error) throw new BetBuilderDataUnavailable("quote", odds.error);
    best = (odds.data ?? []) as BestOddsH2hRow[];
  }
  // Più eventi del provider sulla stessa partita: si tiene il più recente.
  const bestByMatch = new Map<number, BestOddsH2hRow>();
  for (const b of best) {
    if (b.match_id === null) continue;
    const cur = bestByMatch.get(b.match_id);
    if (!cur || b.observed_at > cur.observed_at) bestByMatch.set(b.match_id, b);
  }

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
    const { price } = bestPrice(bestByMatch.get(p.match_id), p.selection);
    const freshness: FreshnessStatus | null = price === null ? null : "FRESH";
    option.outcomes.push({
      matchId: p.match_id,
      homeTeam: p.home_team_name,
      awayTeam: p.away_team_name,
      kickoffAt: p.kickoff_at,
      selection: p.selection,
      probability: Number(p.probability),
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
