import "server-only";
import type {
  ActivePredictionRow,
  IngestionRunStatus,
  ModelKey,
  ModelVersionSummaryRow,
} from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";
import { parseHistoryCheck, type HistoryCheck } from "./history";

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

/** Verifica storica del modello attivo (ultimo backtest con il riepilogo, ADR 0057). */
export async function getActiveHistoryCheck(): Promise<HistoryCheck | null> {
  const supabase = await createClient();
  const { data: active, error } = await supabase
    .from("model_versions")
    .select("id")
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error) throw new PredictionsUnavailable("modello attivo", error);
  if (!active) return null;
  const { data, error: btError } = await supabase
    .from("backtests")
    .select("reliability, window_start, window_end, created_at")
    .eq("model_version_id", active.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (btError) throw new PredictionsUnavailable("verifica storica", btError);
  if (!data) return null;
  return parseHistoryCheck(data.reliability, {
    windowStart: data.window_start,
    windowEnd: data.window_end,
    checkedAt: data.created_at,
  });
}

/** Ultima previsione prima del calcio d'inizio di una partita (anche finita). */
export async function getPreKickoffPredictions(matchId: number): Promise<ActivePredictionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_pre_kickoff_predictions")
    .select("*")
    .eq("match_id", matchId)
    .in("market", ["1X2", "DOUBLE_CHANCE", "TOTAL_GOALS", "BTTS"])
    .limit(200);
  if (error) throw new PredictionsUnavailable("previsioni prima della partita", error);
  return (data ?? []) as ActivePredictionRow[];
}

/**
 * ID delle partite in programma tra `now` e `end` (lettura leggera di `v_match_center`).
 * Le letture di `v_active_predictions` vanno fatte per `match_id`: è la chiave del
 * DISTINCT ON della vista e usa l'indice; filtrarla per data scorre tutto lo storico.
 */
export async function upcomingMatchIds(now: Date, end?: Date): Promise<number[]> {
  const supabase = await createClient();
  let query = supabase
    .from("v_match_center")
    .select("match_id")
    .eq("status", "SCHEDULED")
    .gt("kickoff_at", now.toISOString());
  if (end) query = query.lt("kickoff_at", end.toISOString());
  const { data, error } = await query.order("kickoff_at").limit(1000);
  if (error) throw new PredictionsUnavailable("partite in programma", error);
  return (data ?? []).map((r) => Number(r.match_id));
}
