import "server-only";
import type { ActivePredictionRow } from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";
import { PredictionsUnavailable } from "@/lib/predictions/queries";
import { BANDS, CERTAINTY_MARKETS } from "./logic";

/*
 * Letture per la pagina Certezze, con la sessione dell'utente (RLS: utenti attivi).
 * Solo le previsioni del modello attivo (`v_active_predictions`).
 */

const PAGE = 1000;
const MAX_ROWS = 20_000;
/** Finestra della verifica sulle partite già giocate. */
export const VERIFY_DAYS = 120;

const MIN_PROBABILITY = BANDS[0]![0];

async function pagedPredictions(
  what: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<ActivePredictionRow[]> {
  const out: ActivePredictionRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new PredictionsUnavailable(what, error);
    const rows = (data ?? []) as ActivePredictionRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Previsioni sopra la soglia minima per le partite non ancora iniziate. */
export async function upcomingHighProbability(now = new Date()): Promise<ActivePredictionRow[]> {
  const supabase = await createClient();
  return pagedPredictions("certezze in arrivo", (from, to) =>
    supabase
      .from("v_active_predictions")
      .select("*")
      .gt("kickoff_at", now.toISOString())
      .eq("match_status", "SCHEDULED")
      .in("market", [...CERTAINTY_MARKETS])
      .gte("probability", MIN_PROBABILITY)
      .order("kickoff_at", { ascending: true })
      .order("match_id", { ascending: true })
      .order("market", { ascending: true })
      .order("selection", { ascending: true })
      .order("line", { ascending: true })
      .range(from, to),
  );
}

export interface Verification {
  rows: ActivePredictionRow[];
  results: Map<number, { home: number; away: number }>;
}

/** Previsioni sopra la soglia minima sulle partite finite negli ultimi `VERIFY_DAYS` giorni. */
export async function recentVerification(now = new Date()): Promise<Verification> {
  const supabase = await createClient();
  const since = new Date(now.getTime() - VERIFY_DAYS * 86_400_000).toISOString();
  const rows = await pagedPredictions("verifica delle certezze", (from, to) =>
    supabase
      .from("v_active_predictions")
      .select("*")
      .gte("kickoff_at", since)
      .lt("kickoff_at", now.toISOString())
      .eq("match_status", "FINISHED")
      .in("market", [...CERTAINTY_MARKETS])
      .gte("probability", MIN_PROBABILITY)
      .order("kickoff_at", { ascending: true })
      .order("match_id", { ascending: true })
      .order("market", { ascending: true })
      .order("selection", { ascending: true })
      .order("line", { ascending: true })
      .range(from, to),
  );

  const results = new Map<number, { home: number; away: number }>();
  const ids = [...new Set(rows.map((r) => r.match_id))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("v_match_results")
      .select("match_id, home_score, away_score")
      .in("match_id", ids.slice(i, i + 200));
    if (error) throw new PredictionsUnavailable("risultati per la verifica", error);
    for (const r of (data ?? []) as {
      match_id: number;
      home_score: number | null;
      away_score: number | null;
    }[]) {
      if (r.home_score !== null && r.away_score !== null) {
        results.set(r.match_id, { home: r.home_score, away: r.away_score });
      }
    }
  }
  return { rows, results };
}
