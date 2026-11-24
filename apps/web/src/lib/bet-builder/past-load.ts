import "server-only";
import { createClient } from "@/lib/supabase/server";
import { inChunks } from "@/lib/chunks";
import type { Bolletta, BollettaPick, BollettaProfile, SlipWindow } from "./bollette";
import { pastRounds, type PastRound } from "./past";
import type { SavedPick } from "./record";

/** Giorni di schedine salvate mostrati nelle Passate. */
const PAST_DAYS = 30;

interface SavedRow {
  window_start: string;
  profile: BollettaProfile;
  picks: SavedPick[];
  price: number;
  probability: number;
  expected_value: number;
  odds_observed_at: string | null;
  source: "live" | "rebuilt";
  last_seen_at: string;
}

/** Schedina salvata nel formato delle pagine. `rebuilt`: ricostruita dopo, con i dati di allora. */
export type SavedBolletta = Bolletta & { rebuilt: boolean };

function toBolletta(r: SavedRow): SavedBolletta {
  const picks: BollettaPick[] = r.picks.map((p) => ({
    matchId: p.matchId,
    competitionId: p.competitionId,
    kickoffAt: p.kickoffAt,
    home: p.home,
    away: p.away,
    market: p.market,
    line: p.line,
    selection: p.selection,
    probability: p.probability,
    modelProbability: p.probability,
    marketProbability: null,
    confidence: 0,
    price: p.price,
    bookmaker: p.bookmaker,
    observedAt: r.odds_observed_at ?? "",
    edge: p.probability * p.price - 1,
  }));
  return {
    profile: r.profile,
    round: r.window_start,
    picks,
    probability: Number(r.probability),
    price: Number(r.price),
    expectedValue: Number(r.expected_value),
    oddsObservedAt: r.odds_observed_at ?? "",
    rebuilt: r.source === "rebuilt",
  };
}

/**
 * Schedine salvate (ADR 0070) dei periodi già iniziati, con l'esito di ogni partita.
 * Per ogni periodo e profilo si mostra l'ultima versione proposta prima delle partite;
 * quelle proposte davvero vincono su quelle ricostruite.
 */
export async function loadPastRounds(window: SlipWindow = "round"): Promise<PastRound[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - PAST_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("recommended_slips")
    .select(
      "window_start, profile, picks, price, probability, expected_value, odds_observed_at, source, last_seen_at",
    )
    .eq("window_kind", window)
    .gte("window_start", since)
    .lt("first_kickoff_at", new Date().toISOString())
    .order("window_start", { ascending: false })
    .limit(1000);
  if (error) throw new Error("Schedine salvate non disponibili");
  const latest = new Map<string, SavedRow>();
  for (const r of (data ?? []) as SavedRow[]) {
    const key = `${r.window_start}|${r.profile}`;
    const cur = latest.get(key);
    const better =
      !cur ||
      (cur.source === "rebuilt" && r.source === "live") ||
      (cur.source === r.source && r.last_seen_at > cur.last_seen_at);
    if (better) latest.set(key, r);
  }
  const bollette = [...latest.values()].map(toBolletta);
  const ids = [...new Set(bollette.flatMap((b) => b.picks.map((p) => p.matchId)))];
  const results = new Map<number, { home: number; away: number }>();
  const rows = await inChunks(ids, 100, async (chunk) => {
    const { data: res } = await supabase
      .from("v_match_results")
      .select("match_id, home_score, away_score")
      .in("match_id", chunk);
    return (res ?? []) as { match_id: number; home_score: number; away_score: number }[];
  });
  for (const r of rows) results.set(Number(r.match_id), { home: r.home_score, away: r.away_score });
  return pastRounds(bollette, results, 10);
}
