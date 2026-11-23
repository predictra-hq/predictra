import type { GroupStat } from "@/lib/certainties/reliability";

/*
 * Verifica storica del modello attivo (ADR 0057): il riepilogo che il motore salva in
 * `backtests.reliability` rigiocando migliaia di partite passate. Qui solo la lettura
 * e la conversione nei gruppi della pagina Affidabilità. Funzioni pure, testate.
 */

export interface Tally {
  count: number;
  wins: number;
  /** Somma delle probabilità con cui erano date. */
  predicted: number;
}

export interface HistoryCheck {
  matches: number;
  threshold: number;
  favourite: Tally;
  exactScore: Tally;
  picks: Tally;
  bands: (Tally & { from: number; to: number })[];
  markets: (Tally & { market: string })[];
  /** Mercato (con la linea) per fascia, tutti gli esiti (versione 2, ADR 0065). */
  marketBands: (Tally & { market: string; from: number })[];
  competitions: (Tally & { competitionId: number })[];
  seasons: (Tally & { season: string })[];
  weeks: (Tally & { week: string })[];
  windowStart: string | null;
  windowEnd: string | null;
  checkedAt: string | null;
}

function tally(v: unknown): Tally | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const count = Number(o.count);
  const wins = Number(o.wins);
  const predicted = Number(o.predicted);
  if (![count, wins, predicted].every(Number.isFinite) || count < 0 || wins > count) return null;
  return { count, wins, predicted };
}

function list<T>(v: unknown, extra: (o: Record<string, unknown>) => T | null): (Tally & T)[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    const t = tally(item);
    const e = item && typeof item === "object" ? extra(item as Record<string, unknown>) : null;
    return t && e ? [{ ...t, ...e }] : [];
  });
}

/** Riepilogo letto dal database; `null` se manca o non è nel formato atteso. */
export function parseHistoryCheck(
  raw: unknown,
  meta: { windowStart?: string | null; windowEnd?: string | null; checkedAt?: string | null } = {},
): HistoryCheck | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const favourite = tally(o.favourite);
  const exactScore = tally(o.exact_score);
  const picks = tally(o.picks);
  const matches = Number(o.matches);
  if (!favourite || !exactScore || !picks || !Number.isFinite(matches) || matches <= 0) return null;
  return {
    matches,
    threshold: Number(o.threshold) || 0.7,
    favourite,
    exactScore,
    picks,
    bands: list(o.bands, (x) =>
      Number.isFinite(Number(x.from)) && Number.isFinite(Number(x.to))
        ? { from: Number(x.from), to: Number(x.to) }
        : null,
    ),
    markets: list(o.markets, (x) => (typeof x.market === "string" ? { market: x.market } : null)),
    marketBands: list(o.market_bands, (x) =>
      typeof x.market === "string" && Number.isFinite(Number(x.from))
        ? { market: x.market, from: Number(x.from) }
        : null,
    ),
    competitions: list(o.competitions, (x) =>
      Number.isInteger(Number(x.competition_id))
        ? { competitionId: Number(x.competition_id) }
        : null,
    ),
    seasons: list(o.seasons, (x) => (typeof x.season === "string" ? { season: x.season } : null)),
    weeks: list(o.weeks, (x) => (typeof x.week === "string" ? { week: x.week } : null)),
    windowStart: meta.windowStart ?? null,
    windowEnd: meta.windowEnd ?? null,
    checkedAt: meta.checkedAt ?? null,
  };
}

/** Un conteggio nel formato dei gruppi della pagina (uscite e probabilità medie). */
export function toGroupStat(key: string, t: Tally): GroupStat {
  return {
    key,
    count: t.count,
    wins: t.wins,
    predicted: t.count ? t.predicted / t.count : 0,
    observed: t.count ? t.wins / t.count : 0,
  };
}

/** "TOTAL_GOALS:2.5" → mercato e linea. */
export function splitMarketKey(key: string): { market: string; line: number | null } {
  const [market, line] = key.split(":");
  return { market: market!, line: line === undefined ? null : Number(line) };
}
