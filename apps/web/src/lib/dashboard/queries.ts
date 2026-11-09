import "server-only";
import type { ActivePredictionRow, MatchCenterRow } from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";

/** Prossime partite in calendario (non ancora iniziate), dalla più vicina. */
export async function listNextMatches(
  limit = 6,
  now: Date = new Date(),
): Promise<MatchCenterRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_match_center")
    .select("*")
    .eq("status", "SCHEDULED")
    .gte("kickoff_at", now.toISOString())
    .order("kickoff_at")
    .order("match_id")
    .limit(limit);
  if (error) throw new Error(`Dashboard: calendario non disponibile (${error.code ?? "?"})`);
  return (data ?? []) as MatchCenterRow[];
}

/**
 * Previsioni 1X2 del modello attivo per le partite indicate. Vuoto se nessun modello è
 * attivo (la vista restituisce solo le previsioni della versione ACTIVE).
 */
export async function listPredictions1x2(matchIds: number[]): Promise<ActivePredictionRow[]> {
  if (matchIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_active_predictions")
    .select("*")
    .eq("market", "1X2")
    .in("match_id", matchIds)
    .limit(matchIds.length * 3);
  if (error) throw new Error(`Dashboard: previsioni non disponibili (${error.code ?? "?"})`);
  return (data ?? []) as ActivePredictionRow[];
}
