import type { SharedSlip } from "@predictra/shared-types";

/*
 * Schedine condivise nella comunità (ADR 0064): riepilogo in testo (titolo, partite,
 * esito, quota) da mostrare in chat o inviare ad altre app. Funzioni pure, testate.
 */

export const MAX_SHARED_PICKS = 12;
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
    return match && pick ? [{ match, pick, price: price(x.price) }] : [];
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
