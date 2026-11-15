/*
 * Calcolatore Kelly del Tracker (ADR 0030): probabilità 1X2 del modello attivo + quota
 * inserita dall'utente → stake suggerito. Solo informativo: PREDICTRA non piazza scommesse.
 * Il calcolo dello stake resta in `@predictra/bankroll` (`suggestStake`).
 */
import { parseDecimal } from "./validation";

export const KELLY_SELECTIONS = ["HOME", "DRAW", "AWAY"] as const;
export type KellySelection = (typeof KELLY_SELECTIONS)[number];

export interface KellyMatch {
  matchId: number;
  kickoffAt: string;
  home: string;
  away: string;
  probabilities: Partial<Record<KellySelection, number>>;
}

/** Righe 1X2 della vista `v_active_predictions` → una voce per partita, in ordine di calcio d'inizio. */
export function groupKellyMatches(
  rows: readonly {
    match_id: number;
    kickoff_at: string;
    home_team_name: string;
    away_team_name: string;
    selection: string;
    probability: number;
  }[],
): KellyMatch[] {
  const byMatch = new Map<number, KellyMatch>();
  for (const r of rows) {
    if (!(KELLY_SELECTIONS as readonly string[]).includes(r.selection)) continue;
    const id = Number(r.match_id);
    const entry = byMatch.get(id) ?? {
      matchId: id,
      kickoffAt: r.kickoff_at,
      home: r.home_team_name,
      away: r.away_team_name,
      probabilities: {},
    };
    entry.probabilities[r.selection as KellySelection] = Number(r.probability);
    byMatch.set(id, entry);
  }
  return [...byMatch.values()]
    .filter((m) => KELLY_SELECTIONS.every((s) => m.probabilities[s] !== undefined))
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.matchId - b.matchId);
}

export interface KellyInput {
  matchId: number | null;
  selection: KellySelection | null;
  odds: number | null;
  /** Vero se è stata inserita una quota non valida (non numerica o ≤ 1). */
  invalidOdds: boolean;
}

/** Parametri della pagina (`km`, `ks`, `ko`) → input del calcolatore. */
export function parseKellyInput(params: {
  km?: string | string[];
  ks?: string | string[];
  ko?: string | string[];
}): KellyInput {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const km = one(params.km);
  const matchId = km && /^\d{1,15}$/.test(km) ? Number(km) : null;
  const ks = one(params.ks);
  const selection = (KELLY_SELECTIONS as readonly string[]).includes(ks ?? "")
    ? (ks as KellySelection)
    : null;
  const parsed = parseDecimal(one(params.ko));
  const validOdds = parsed !== undefined && Number.isFinite(parsed) && parsed > 1;
  return {
    matchId,
    selection,
    odds: validOdds ? parsed : null,
    invalidOdds: parsed !== undefined && !validOdds,
  };
}

/** Valore atteso per unità puntata: p·o − 1 (positivo = quota con valore). */
export function expectedValue(probability: number, odds: number): number {
  return probability * odds - 1;
}

/** Quota equa secondo il modello: 1/p. */
export function fairOdds(probability: number): number | null {
  return probability > 0 ? 1 / probability : null;
}
