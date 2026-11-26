import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSlipVerification } from "@/lib/certainties/load";
import { withServiceClient } from "@/lib/supabase/server";
import {
  buildBollette,
  SLIP_RULES_VERSION,
  SLIP_WINDOWS,
  slipRulesSnapshot,
  type Bolletta,
  type SlipWindow,
} from "./bollette";
import { loadCalibration } from "./calibration-load";
import type { LikelyRow } from "./likely";
import { picksData } from "./queries";

/*
 * Salvataggio delle schedine consigliate (ADR 0070). L'avvio programmato dell'agente
 * (firma QStash già verificata) le calcola come la pagina Proposte e le scrive in
 * `recommended_slips`, così dopo le partite si ritrovano quelle proposte davvero.
 */

/** Giocata salvata: quanto serve per mostrarla e per vedere se è uscita. */
export interface SavedPick {
  matchId: number;
  competitionId: number | null;
  kickoffAt: string;
  home: string;
  away: string;
  market: string;
  line: number | null;
  selection: string;
  probability: number;
  price: number;
  bookmaker: string;
  /** Riproducibilità (ADR 0075): da cosa è nata la probabilità e quando era la quota. */
  modelProbability?: number;
  marketProbability?: number | null;
  observedAt?: string;
  modelVersionId?: number | null;
  predictionAsOf?: string | null;
}

export function signatureOf(b: Pick<Bolletta, "picks">): string {
  return b.picks.map((p) => `${p.matchId}|${p.market}|${p.line ?? ""}|${p.selection}`).join(";");
}

export function slipRow(b: Bolletta, window: SlipWindow, source: "live" | "rebuilt") {
  const picks: SavedPick[] = b.picks.map((p) => ({
    matchId: p.matchId,
    competitionId: p.competitionId ?? null,
    kickoffAt: p.kickoffAt,
    home: p.home,
    away: p.away,
    market: p.market,
    line: p.line,
    selection: p.selection,
    probability: Number(p.probability.toFixed(6)),
    price: p.price,
    bookmaker: p.bookmaker,
    modelProbability: Number(p.modelProbability.toFixed(6)),
    marketProbability: p.marketProbability === null ? null : Number(p.marketProbability.toFixed(6)),
    observedAt: p.observedAt,
    modelVersionId: p.modelVersionId ?? null,
    predictionAsOf: p.predictionAsOf ?? null,
  }));
  const versions = [...new Set(b.picks.map((p) => p.modelVersionId ?? null))];
  return {
    window_kind: window,
    window_start: b.round,
    profile: b.profile,
    signature: signatureOf(b),
    picks,
    price: Number(b.price.toFixed(6)),
    probability: Number(b.probability.toFixed(8)),
    expected_value: Number(b.expectedValue.toFixed(6)),
    odds_observed_at: b.oddsObservedAt || null,
    model_version_id: versions.length === 1 ? versions[0] : null,
    rules_version: SLIP_RULES_VERSION,
    rules: slipRulesSnapshot(b.profile),
    relax_step: b.relaxStep ?? null,
    first_kickoff_at: b.picks.map((p) => p.kickoffAt).sort()[0]!,
    source,
  };
}

/**
 * Salva le schedine di adesso (solo quelle con tutte le partite ancora da giocare) e, la
 * prima volta, quelle ricostruite dei giorni passati. Restituisce quante ne ha scritte.
 */
export async function recordSlips(admin: SupabaseClient, now = new Date()): Promise<number> {
  return withServiceClient(admin, async () => {
    const [{ rows, prices, consensus }, calibration] = await Promise.all([
      picksData(),
      loadCalibration(),
    ]);
    const live = SLIP_WINDOWS.flatMap((window) =>
      buildBollette(rows, prices, consensus, calibration, { window })
        .filter((b) => b.picks.every((p) => Date.parse(p.kickoffAt) > now.getTime()))
        .map((b) => ({ ...slipRow(b, window, "live"), last_seen_at: now.toISOString() })),
    );
    let written = 0;
    if (live.length > 0) {
      const { error } = await admin
        .from("recommended_slips")
        .upsert(live, { onConflict: "window_kind,window_start,profile,signature" });
      if (error) throw new Error("recommended_slips");
      written += live.length;
    }
    written += await rebuildOnce(admin);
    return written;
  });
}

/** Una volta sola: le schedine dei giorni passati ricostruite con i dati di prima delle partite. */
async function rebuildOnce(admin: SupabaseClient): Promise<number> {
  const { count } = await admin
    .from("recommended_slips")
    .select("id", { count: "exact", head: true })
    .eq("source", "rebuilt");
  if ((count ?? 0) > 0) return 0;
  const [v, calibration] = await Promise.all([loadSlipVerification(), loadCalibration()]);
  const rows = v.rows as unknown as LikelyRow[];
  const past = SLIP_WINDOWS.flatMap((window) =>
    buildBollette(rows, v.prices, v.consensus, calibration, { window }).map((b) =>
      slipRow(b, window, "rebuilt"),
    ),
  );
  if (past.length === 0) return 0;
  const { error } = await admin.from("recommended_slips").upsert(past, {
    onConflict: "window_kind,window_start,profile,signature",
    ignoreDuplicates: true,
  });
  if (error) throw new Error("recommended_slips (ricostruite)");
  return past.length;
}
