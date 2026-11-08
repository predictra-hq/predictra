import "server-only";
import type {
  ActivePredictionRow,
  IngestionRunStatus,
  ModelKey,
  ModelVersionSummaryRow,
} from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";

/*
 * Letture lato server sulle viste del contratto M4 (docs/data-dictionary/predictions.md),
 * con la sessione dell'utente: la RLS consente la lettura solo agli utenti attivi.
 */

export class PredictionsUnavailable extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Lettura non riuscita: ${what}`, { cause });
  }
}

export interface PredictionRunRow {
  id: number;
  model_version_id: number;
  status: IngestionRunStatus;
  triggered_by: string;
  started_at: string;
  finished_at: string | null;
  matches_scored: number;
  predictions_written: number;
  error_summary: string | null;
  model_versions: { model_key: ModelKey; version: string } | null;
}

export async function listModelVersions(): Promise<ModelVersionSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_model_versions_summary")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new PredictionsUnavailable("versioni dei modelli", error);
  return (data ?? []) as ModelVersionSummaryRow[];
}

export async function listPredictionRuns(limit = 20): Promise<PredictionRunRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prediction_runs")
    .select(
      "id, model_version_id, status, triggered_by, started_at, finished_at, matches_scored, predictions_written, error_summary, model_versions(model_key, version)",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new PredictionsUnavailable("esecuzioni del motore", error);
  return (data ?? []) as unknown as PredictionRunRow[];
}

/** Vero se esiste una versione di modello ACTIVE. */
export async function hasActiveModel(): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("model_versions")
    .select("id", { count: "exact", head: true })
    .eq("status", "ACTIVE");
  if (error) throw new PredictionsUnavailable("modello attivo", error);
  return (count ?? 0) > 0;
}

/** Previsioni del modello attivo per una partita (vuoto se nessun modello è attivo). */
export async function getMatchPredictions(matchId: number): Promise<ActivePredictionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_active_predictions")
    .select("*")
    .eq("match_id", matchId)
    .limit(500);
  if (error) throw new PredictionsUnavailable("previsioni", error);
  return (data ?? []) as ActivePredictionRow[];
}
