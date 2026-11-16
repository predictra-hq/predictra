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
export const VERIFY_DAYS = 60;

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

/** Partite per gruppi: `match_id` è la chiave del DISTINCT ON della vista e usa l'indice. */
const ID_CHUNK = 200;
/** Orizzonte delle previsioni del motore (prossimi 10 giorni) con un margine. */
const UPCOMING_DAYS = 14;

export async function predictionsFor(
  ids: readonly number[],
  what: string,
  /** `v_pre_kickoff_predictions` per le partite giocate: vale anche dopo un cambio di versione. */
  relation: "v_active_predictions" | "v_pre_kickoff_predictions" = "v_active_predictions",
): Promise<ActivePredictionRow[]> {
  const supabase = await createClient();
  const out: ActivePredictionRow[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK) as number[];
    out.push(
      ...(await pagedPredictions(what, (from, to) =>
        supabase
          .from(relation)
          .select("*")
          .in("match_id", chunk)
          .in("market", [...CERTAINTY_MARKETS])
          .gte("probability", MIN_PROBABILITY)
          .order("match_id", { ascending: true })
          .order("market", { ascending: true })
          .order("selection", { ascending: true })
          .order("line", { ascending: true })
          .range(from, to),
      )),
    );
  }
  return out;
}

/** Previsioni sopra la soglia minima per le partite non ancora iniziate. */
export async function upcomingHighProbability(
  now = new Date(),
  hours = UPCOMING_DAYS * 24,
): Promise<ActivePredictionRow[]> {
  const supabase = await createClient();
  const end = new Date(now.getTime() + hours * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("v_match_center")
    .select("match_id")
    .eq("status", "SCHEDULED")
    .gt("kickoff_at", now.toISOString())
    .lt("kickoff_at", end)
    .order("match_id")
    .limit(1000);
  if (error) throw new PredictionsUnavailable("partite in arrivo", error);
  const ids = (data ?? []).map((r) => Number(r.match_id));
  const rows = await predictionsFor(ids, "certezze in arrivo");
  return rows.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at) || a.match_id - b.match_id);
}

export interface Verification {
  rows: ActivePredictionRow[];
  results: Map<number, { home: number; away: number }>;
}

/** Previsioni sopra la soglia minima sulle partite finite negli ultimi `VERIFY_DAYS` giorni. */
export async function recentVerification(now = new Date()): Promise<Verification> {
  const supabase = await createClient();
  const since = new Date(now.getTime() - VERIFY_DAYS * 86_400_000).toISOString();
  const results = new Map<number, { home: number; away: number }>();
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("v_match_results")
      .select("match_id, home_score, away_score")
      .gte("kickoff_at", since)
      .lt("kickoff_at", now.toISOString())
      .order("match_id")
      .range(from, from + PAGE - 1);
    if (error) throw new PredictionsUnavailable("risultati per la verifica", error);
    const page = (data ?? []) as {
      match_id: number;
      home_score: number | null;
      away_score: number | null;
    }[];
    for (const r of page) {
      if (r.home_score !== null && r.away_score !== null) {
        results.set(Number(r.match_id), { home: r.home_score, away: r.away_score });
      }
    }
    if (page.length < PAGE) break;
  }
  const rows = await predictionsFor(
    [...results.keys()],
    "verifica delle certezze",
    "v_pre_kickoff_predictions",
  );
  return { rows, results };
}
