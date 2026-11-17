import "server-only";
import { userBookmaker } from "@/lib/bankroll/queries";
import type {
  ActivePredictionRow,
  ActiveBetProposalRow,
  BetBuilderLatestRunRow,
  BetProposalKind,
  BetProposalLegRow,
  UserBetSlipRow,
  UserBetSlipSelectionRow,
} from "@predictra/shared-types";
import { DEFAULT_BET_BUILDER_RULES } from "@predictra/shared-types";
import { cache } from "react";
import { consensusFor, marketConsensus } from "./bollette";
import {
  bestItalianPrices,
  italianPriceFor,
  LIKELY_MARKETS,
  type LatestOddsRow,
  type LikelyRow,
} from "./likely";
import { usedProbability } from "./market";
import { inChunks } from "@/lib/chunks";
import { upcomingMatchIds } from "@/lib/predictions/queries";
import { createClient } from "@/lib/supabase/server";
import { BUILDER_MARKETS, type ManualSelection } from "./evaluate";
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

/** Righe restituite da Supabase per richiesta (`max_rows` predefinito del progetto). */
const PAGE_SIZE = 1000;
/** Tetto di sicurezza: 50 pagine = 50.000 righe. */
const MAX_PAGES = 50;

/**
 * Legge tutte le pagine di una query: Supabase restituisce al massimo 1.000 righe per
 * richiesta e taglia le altre senza errore. `page` deve costruire ogni volta la stessa
 * query, con un ordinamento stabile, e applicare `range(from, to)`.
 */
async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
    if (error) throw new BetBuilderDataUnavailable(what, error);
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

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
  /** Giocate della partita: 1X2, doppia chance, gol totali 1,5–2,5–3,5, entrambe segnano. */
  outcomes: (ManualSelection & { market: string; line: number | null })[];
}

const BUILDER_ORDER = Object.entries(BUILDER_MARKETS).flatMap(([market, spec]) =>
  spec.lines.flatMap((line) => spec.selections.map((sel) => `${market}|${line ?? ""}|${sel}`)),
);

/**
 * Giocate delle partite in programma nei prossimi giorni per Costruisci: previsioni del
 * modello attivo sui mercati di `BUILDER_MARKETS`, probabilità combinata con il mercato
 * (ADR 0028) e migliore quota italiana raccolta, preferendo il sito del bankroll.
 */
export async function listManualOptions(now: Date, matchIds?: number[]): Promise<ManualOption[]> {
  const supabase = await createClient();
  const end = new Date(now.getTime() + MANUAL_HORIZON_DAYS * 86_400_000);
  const ids = matchIds ?? (await upcomingMatchIds(now, end)).slice(0, 300);
  if (ids.length === 0) return [];
  const predictions = await selectAll<
    Pick<
      ActivePredictionRow,
      | "match_id"
      | "competition_id"
      | "kickoff_at"
      | "home_team_name"
      | "away_team_name"
      | "market"
      | "line"
      | "selection"
      | "probability"
      | "confidence_score"
    >
  >(
    (from, to) =>
      supabase
        .from("v_active_predictions")
        .select(
          "match_id, competition_id, kickoff_at, home_team_name, away_team_name, market, line, selection, probability, confidence_score",
        )
        .in("match_id", ids)
        .in("market", Object.keys(BUILDER_MARKETS))
        .order("match_id")
        .order("market")
        .order("selection")
        .range(from, to),
    "previsioni",
  );
  const withPrediction = [...new Set(predictions.map((p) => p.match_id))];
  const [odds, site] = await Promise.all([
    inChunks(withPrediction, 5, (chunk) => listLatestOdds(chunk), 4),
    userBookmaker(),
  ]);
  const prices = bestItalianPrices(odds, site?.tracked ?? null);
  const consensus = marketConsensus(odds);
  const weight = DEFAULT_BET_BUILDER_RULES.market_weight ?? 0;

  const options = new Map<number, ManualOption>();
  for (const p of predictions) {
    const line = p.line === null ? null : Number(p.line);
    const spec = BUILDER_MARKETS[p.market];
    if (!spec || !spec.lines.includes(line) || !spec.selections.includes(p.selection)) continue;
    let option = options.get(p.match_id);
    if (!option) {
      option = {
        matchId: p.match_id,
        competitionId: p.competition_id,
        kickoffAt: p.kickoff_at,
        homeTeam: p.home_team_name,
        awayTeam: p.away_team_name,
        outcomes: [],
      };
      options.set(p.match_id, option);
    }
    const pick = { matchId: p.match_id, market: p.market, line, selection: p.selection };
    const price = italianPriceFor(prices, pick)?.price ?? null;
    option.outcomes.push({
      ...pick,
      homeTeam: p.home_team_name,
      awayTeam: p.away_team_name,
      kickoffAt: p.kickoff_at,
      probability: usedProbability(
        Number(p.probability),
        consensusFor(consensus, pick) ?? undefined,
        weight,
      ),
      confidence: Number(p.confidence_score),
      price,
      freshness: price === null ? null : "FRESH",
    });
  }
  const rank = (o: { market: string; line: number | null; selection: string }) =>
    BUILDER_ORDER.indexOf(`${o.market}|${o.line ?? ""}|${o.selection}`);
  const list = [...options.values()];
  for (const o of list) o.outcomes.sort((a, b) => rank(a) - rank(b));
  return list.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.matchId - b.matchId);
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
  // Prima le partite in programma, poi le previsioni per partita (vedi upcomingMatchIds).
  const ids = await upcomingMatchIds(now, end);
  // Circa 35 righe per partita: gruppi da 25 partite stanno in una pagina, in parallelo.
  return inChunks(ids, 25, (chunk) =>
    selectAll<LikelyRow>(
      (from, to) =>
        supabase
          .from("v_active_predictions")
          .select(
            "match_id, kickoff_at, home_team_name, away_team_name, market, line, selection, probability, confidence_score",
          )
          .in("match_id", chunk)
          .in("market", Object.keys(LIKELY_MARKETS))
          .order("match_id")
          .order("market")
          .order("line", { nullsFirst: true })
          .order("selection")
          .range(from, to),
      "previsioni",
    ),
  );
}

/**
 * Ultime quote di tutti i bookmaker (1X2, doppia chance e under/over) per le partite
 * indicate. `italian` distingue le quote giocabili (bookmaker italiani, ADR 0028); tutte
 * insieme danno la probabilità di mercato senza margine.
 */
/** Elenco dei bookmaker, letto una volta per richiesta anche con molti gruppi di quote. */
const listBookmakers = cache(async () => {
  const supabase = await createClient();
  return supabase.from("bookmakers").select("code, title, italian_market");
});

export async function listLatestOdds(matchIds: readonly number[]): Promise<LatestOddsRow[]> {
  if (matchIds.length === 0) return [];
  const supabase = await createClient();
  const books = await listBookmakers();
  if (books.error) throw new BetBuilderDataUnavailable("bookmaker", books.error);
  const titles = new Map((books.data ?? []).map((b) => [String(b.code), String(b.title)]));
  const italian = new Set(
    (books.data ?? []).filter((b) => b.italian_market).map((b) => String(b.code)),
  );
  // Funzione veloce per partita (migrazione 20261116100000): la vista v_latest_odds
  // filtrata per partita scorre tutto lo storico e va in timeout.
  const all = await selectAll<LatestOddsRow & { quality: string }>(
    (from, to) =>
      supabase
        .rpc("latest_odds_for_matches", { p_match_ids: matchIds as number[] })
        .select("match_id, bookmaker, market, selection, price, observed_at, quality")
        .range(from, to) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>,
    "quote",
  );
  const rows = all
    .filter(
      (r) =>
        r.quality === "OK" &&
        (r.market === "h2h" || r.market === "double_chance" || r.market.startsWith("totals_")),
    )
    .map((r) => ({
      match_id: r.match_id,
      bookmaker: r.bookmaker,
      market: r.market,
      selection: r.selection,
      price: r.price,
      observed_at: r.observed_at,
    }));
  // Nome leggibile del bookmaker (es. "Unibet (IT)") al posto del codice.
  return rows.map((r) => ({
    ...r,
    italian: italian.has(r.bookmaker),
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
    .in(
      "proposal_id",
      rows.map((r) => r.id),
    )
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

/**
 * Previsioni e migliori quote italiane delle partite dei prossimi giorni, lette una sola
 * volta per richiesta: le usano schedine consigliate, più probabili e riquadro della Home.
 */
export const loadPicksData = cache(async () => {
  const rows = await listLikelyRows(new Date());
  const matchIds = [...new Set(rows.map((r) => Number(r.match_id)))];
  // Circa 200 righe di quote per partita: gruppi da 5, in parallelo.
  const odds = await inChunks(matchIds, 5, (chunk) => listLatestOdds(chunk), 4);
  const site = await userBookmaker();
  return {
    rows,
    prices: bestItalianPrices(odds, site?.tracked ?? null),
    consensus: marketConsensus(odds),
  };
});
