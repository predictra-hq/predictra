import "server-only";
import type { ActivePredictionRow } from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";

/**
 * Previsioni 1X2 del modello attivo per le partite non ancora iniziate. Vuoto se nessun
 * modello è attivo (la vista restituisce solo le previsioni della versione ACTIVE).
 */
export async function listUpcoming1x2(
  now: Date = new Date(),
  maxRows = 90,
): Promise<ActivePredictionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_active_predictions")
    .select("*")
    .eq("market", "1X2")
    .gte("kickoff_at", now.toISOString())
    .order("kickoff_at")
    .order("match_id")
    .limit(maxRows);
  if (error) throw new Error(`Dashboard: previsioni non disponibili (${error.code ?? "?"})`);
  return (data ?? []) as ActivePredictionRow[];
}
