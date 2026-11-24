import type { SharedSlip } from "@predictra/shared-types";

/*
 * Schedine condivise nella comunità (ADR 0064): riepilogo in testo (titolo, partite,
 * esito, quota) da mostrare in chat o inviare ad altre app. Funzioni pure, testate.
 */

export const MAX_SHARED_PICKS = 12;
/** `partita|mercato|linea|esito`, come le chiavi delle giocate (ADR 0070). */
const PICK_KEY = /^\d{1,12}\|[A-Z0-9_]{2,20}\|(\d{1,2}(\.\d{1,2})?)?\|[A-Z_]{2,20}$/;

/** Chiave di una giocata da condividere. */
export function pickKey(p: {
  matchId: number;
  market: string;
  line: number | null;
  selection: string;
}): string {
  return `${p.matchId}|${p.market}|${p.line ?? ""}|${p.selection}`;
}

/** Esito di una schedina condivisa, calcolato dai risultati delle sue partite. */
export type SharedOutcome = "WON" | "LOST" | "PENDING";

export function parsePickKey(key: string) {
  const [match, market, line, selection] = key.split("|");
  return {
    matchId: Number(match),
    market: market!,
    line: line ? Number(line) : null,
    selection: selection!,
  };
}
const MAX_TEXT = 120;

const text = (v: unknown, max = MAX_TEXT): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;

const price = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 && n < 100000 ? Math.round(n * 100) / 100 : null;
};

/** Schedina dal modulo (JSON); `null` se non è nel formato atteso. */
export function parseSharedSlip(raw: unknown): SharedSlip | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > 4000) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const title = text(o.title, 60);
  if (!title || !Array.isArray(o.picks) || o.picks.length === 0) return null;
  const picks = o.picks.slice(0, MAX_SHARED_PICKS).flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const x = p as Record<string, unknown>;
    const match = text(x.match);
    const pick = text(x.pick);
    if (!match || !pick) return [];
    const key = typeof x.key === "string" && PICK_KEY.test(x.key) ? x.key : undefined;
    return [{ match, pick, price: price(x.price), ...(key ? { key } : {}) }];
  });
  if (picks.length === 0) return null;
  const probability = Number(o.probability);
  return {
    title,
    picks,
    price: price(o.price),
    probability:
      Number.isFinite(probability) && probability > 0 && probability <= 1 ? probability : null,
  };
}

/** Testo da inviare ad altre app (WhatsApp, Telegram…): una riga per partita. */
export function sharedSlipText(
  slip: SharedSlip,
  labels: { total: string; probability: string },
  formatPrice: (n: number) => string,
  formatProbability: (n: number) => string,
): string {
  const lines = [`🎯 ${slip.title}`];
  for (const p of slip.picks) {
    lines.push(`• ${p.match}: ${p.pick}${p.price ? ` (${formatPrice(p.price)})` : ""}`);
  }
  const totals = [
    slip.price ? `${labels.total} ${formatPrice(slip.price)}` : null,
    slip.probability ? `${labels.probability} ${formatProbability(slip.probability)}` : null,
  ].filter(Boolean);
  if (totals.length) lines.push(totals.join(" · "));
  lines.push("— PREDICTRA");
  return lines.join("\n");
}

export interface SharedResult {
  home: number;
  away: number;
  /** Quando è arrivato il risultato. */
  observedAt: string;
}

/**
 * Esito di una schedina condivisa (ADR 0070): persa appena una partita non esce, vinta
 * quando escono tutte. `updatedAt` è l'arrivo dell'ultimo risultato usato. Senza chiavi
 * (condivisioni precedenti) resta in corso.
 */
export function sharedOutcome(
  slip: SharedSlip,
  results: ReadonlyMap<number, SharedResult>,
  settle: (
    market: string,
    line: number | null,
    selection: string,
    home: number,
    away: number,
  ) => boolean | null,
): { outcome: SharedOutcome; legs: (boolean | null)[]; updatedAt: string | null } {
  let updatedAt: string | null = null;
  const legs = slip.picks.map((p) => {
    if (!p.key) return null;
    const k = parsePickKey(p.key);
    const r = results.get(k.matchId);
    if (!r) return null;
    if (!updatedAt || r.observedAt > updatedAt) updatedAt = r.observedAt;
    return settle(k.market, k.line, k.selection, r.home, r.away);
  });
  const outcome: SharedOutcome = legs.some((l) => l === false)
    ? "LOST"
    : legs.length > 0 && legs.every((l) => l === true)
      ? "WON"
      : "PENDING";
  return { outcome, legs, updatedAt: outcome === "PENDING" ? null : updatedAt };
}

/** ID delle partite delle schedine condivise. */
export function sharedMatchIds(slips: readonly (SharedSlip | null)[]): number[] {
  const ids = new Set<number>();
  for (const s of slips)
    for (const p of s?.picks ?? []) if (p.key) ids.add(parsePickKey(p.key).matchId);
  return [...ids];
}
