import "server-only";
import { cache } from "react";
import type {
  BankrollSummaryRow,
  BetRow,
  MatchOddsH2hRow,
  MovementKind,
  PersonalLimitsRow,
} from "@predictra/shared-types";
import { upcomingMatchIds } from "@/lib/predictions/queries";
import { createClient } from "@/lib/supabase/server";
import { inChunks } from "@/lib/chunks";
import type { BetLeg } from "./legs";
import { matchMarkets } from "@/lib/bet-builder/market";
import { groupKellyMatches, type KellyMatch } from "./kelly";

/*
 * Letture dei dati personali con la sessione dell'utente: la RLS restituisce solo
 * i dati del proprietario (ADR 0030). Le pagine chiamano prima `requireUser()`.
 */

export class BankrollUnavailable extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Lettura non riuscita: ${what}`, { cause });
  }
}

/** Bookmaker italiani di cui PREDICTRA raccoglie le quote: quelli collegabili a un bankroll. */
export async function listItalianBookmakers(): Promise<{ code: string; title: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookmakers")
    .select("code, title")
    .eq("italian_market", true)
    .order("title");
  if (error) throw new BankrollUnavailable("bookmaker", error);
  return (data ?? []).map((b) => ({ code: String(b.code), title: String(b.title) }));
}

/**
 * Il sito del bankroll di riferimento (il primo reale, altrimenti il primo): `tracked` è
 * il nome del bookmaker se PREDICTRA ne raccoglie le quote, `name` il nome scelto
 * dall'utente. Letto una volta per richiesta; senza bankroll o in caso d'errore è null.
 */
export const userBookmaker = cache(
  async (): Promise<{ name: string; tracked: string | null } | null> => {
    try {
      const bankrolls = await listBankrolls();
      const chosen = bankrolls.find((b) => b.kind === "REAL") ?? bankrolls[0];
      if (!chosen?.bookmaker_name) return null;
      return {
        name: chosen.bookmaker_name,
        tracked: chosen.bookmaker_code ? chosen.bookmaker_name : null,
      };
    } catch {
      return null;
    }
  },
);

export interface MovementRow {
  id: number;
  bankroll_id: number;
  kind: MovementKind;
  amount: number;
  occurred_at: string;
  note: string | null;
}

export async function listBankrolls(): Promise<BankrollSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_bankroll_summary")
    .select("*")
    .order("kind")
    .order("name");
  if (error) throw new BankrollUnavailable("bankroll", error);
  return (data ?? []) as BankrollSummaryRow[];
}

export async function listMovements(bankrollId?: number): Promise<MovementRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("bankroll_movements")
    .select("id, bankroll_id, kind, amount, occurred_at, note")
    .order("occurred_at", { ascending: false })
    .limit(1000);
  if (bankrollId !== undefined) query = query.eq("bankroll_id", bankrollId);
  const { data, error } = await query;
  if (error) throw new BankrollUnavailable("movimenti", error);
  return (data ?? []) as MovementRow[];
}

export async function listLimits(): Promise<PersonalLimitsRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("personal_limits").select("*");
  if (error) throw new BankrollUnavailable("limiti", error);
  return (data ?? []) as PersonalLimitsRow[];
}

/** Giocate dell'utente; con `sinceDays` solo quelle registrate negli ultimi giorni. */
export async function listBets(sinceDays?: number): Promise<BetRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("v_bets")
    .select("*")
    .order("placed_at", { ascending: false })
    .limit(1000);
  if (sinceDays !== undefined) {
    query = query.gte("placed_at", new Date(Date.now() - sinceDays * 86_400_000).toISOString());
  }
  const { data, error } = await query;
  if (error) throw new BankrollUnavailable("giocate", error);
  return (data ?? []) as BetRow[];
}

/**
 * Partite in programma con le probabilità 1X2 del modello attivo (calcolatore Kelly).
 * Vuoto se nessun modello è attivo: la vista restituisce solo la versione ACTIVE.
 */
export async function listKellyMatches(now: Date = new Date()): Promise<KellyMatch[]> {
  const supabase = await createClient();
  // Per partita, non per data: la vista usa l'indice (vedi upcomingMatchIds).
  const ids = (await upcomingMatchIds(now)).slice(0, 200);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("v_active_predictions")
    .select("match_id, kickoff_at, home_team_name, away_team_name, selection, probability")
    .eq("market", "1X2")
    .in("match_id", ids)
    .order("kickoff_at")
    .limit(600);
  if (error) throw new BankrollUnavailable("previsioni del modello", error);
  return groupKellyMatches(data ?? []);
}

/**
 * Consenso di mercato senza margine (tutti i bookmaker FRESH) della partita scelta nel
 * calcolatore Kelly, per la probabilità prudente dell'ADR 0028.
 */
export async function getMarketConsensus(
  matchId: number,
): Promise<Partial<Record<"HOME" | "DRAW" | "AWAY", number>>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_match_odds_h2h")
    .select(
      "match_id, bookmaker, italian_market, home_price, draw_price, away_price, home_probability, draw_probability, away_probability, observed_at, freshness, quality",
    )
    .eq("match_id", matchId)
    .limit(500);
  if (error) throw new BankrollUnavailable("quote di mercato", error);
  return matchMarkets((data ?? []) as MatchOddsH2hRow[]).get(matchId)?.consensus ?? {};
}

/** Partita di una giocata registrata: squadre, orario, stato e risultato. */
export interface BetLegMatch {
  home: string;
  away: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * Selezioni delle proprie giocate multiple (ADR 0070) con le partite: per mostrare la
 * schedina giocata e come è andata. Solo le proprie giocate (RLS).
 */
export async function listBetSlips(
  betIds: readonly number[],
): Promise<{ legs: Map<number, BetLeg[]>; matches: Map<number, BetLegMatch> }> {
  const legs = new Map<number, BetLeg[]>();
  const matches = new Map<number, BetLegMatch>();
  if (betIds.length === 0) return { legs, matches };
  const supabase = await createClient();
  const { data } = await supabase.from("bets").select("id, legs").in("id", betIds.slice(0, 500));
  for (const b of (data ?? []) as { id: number; legs: BetLeg[] | null }[]) {
    if (Array.isArray(b.legs) && b.legs.length > 0) legs.set(Number(b.id), b.legs);
  }
  const ids = [...new Set([...legs.values()].flat().map((l) => l.m))];
  if (ids.length === 0) return { legs, matches };
  const rows = await inChunks(ids, 100, async (chunk) => {
    const { data: m } = await supabase
      .from("v_match_center")
      .select(
        "match_id, home_team_name, away_team_name, kickoff_at, status, home_score, away_score",
      )
      .in("match_id", chunk);
    return (m ?? []) as {
      match_id: number;
      home_team_name: string;
      away_team_name: string;
      kickoff_at: string;
      status: string;
      home_score: number | null;
      away_score: number | null;
    }[];
  });
  for (const r of rows) {
    matches.set(Number(r.match_id), {
      home: r.home_team_name,
      away: r.away_team_name,
      kickoffAt: r.kickoff_at,
      status: r.status,
      homeScore: r.home_score,
      awayScore: r.away_score,
    });
  }
  return { legs, matches };
}
