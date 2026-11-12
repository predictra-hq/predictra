/*
 * ADR 0028 nel costruttore manuale: stesse regole del motore del Bet Builder.
 * - Consenso di mercato: media, tra tutti i bookmaker con quote FRESH (anche
 *   internazionali), delle probabilità senza margine (`v_match_odds_h2h`, ADR 0016).
 * - Quota giocabile: la migliore tra i soli bookmaker italiani.
 * - Probabilità usata: (1 − w)·modello + w·mercato.
 */
import type { MatchOddsH2hRow } from "@predictra/shared-types";

export type Outcome = "HOME" | "DRAW" | "AWAY";
const OUTCOMES: readonly Outcome[] = ["HOME", "DRAW", "AWAY"];

export interface MatchMarket {
  /** Consenso senza margine per esito; assente se nessun bookmaker ha quote FRESH. */
  consensus: Partial<Record<Outcome, number>>;
  /** Migliore quota italiana per esito. */
  italian: Partial<Record<Outcome, { price: number; bookmaker: string }>>;
}

type Row = Pick<
  MatchOddsH2hRow,
  | "match_id"
  | "bookmaker"
  | "italian_market"
  | "home_price"
  | "draw_price"
  | "away_price"
  | "home_probability"
  | "draw_probability"
  | "away_probability"
  | "observed_at"
  | "freshness"
  | "quality"
>;

const price = (r: Row, o: Outcome) =>
  Number(o === "HOME" ? r.home_price : o === "DRAW" ? r.draw_price : r.away_price);
const fair = (r: Row, o: Outcome) =>
  Number(
    o === "HOME" ? r.home_probability : o === "DRAW" ? r.draw_probability : r.away_probability,
  );

export function matchMarkets(rows: readonly Row[]): Map<number, MatchMarket> {
  // Una riga per partita e bookmaker: la più recente (più eventi del provider possibili).
  const latest = new Map<string, Row>();
  for (const r of rows) {
    if (r.match_id === null || r.freshness !== "FRESH" || r.quality !== "OK") continue;
    const key = `${r.match_id}|${r.bookmaker}`;
    const cur = latest.get(key);
    if (!cur || r.observed_at > cur.observed_at) latest.set(key, r);
  }
  const sums = new Map<number, { n: number; p: Record<Outcome, number> }>();
  const result = new Map<number, MatchMarket>();
  for (const r of latest.values()) {
    const id = r.match_id as number;
    const m = result.get(id) ?? { consensus: {}, italian: {} };
    result.set(id, m);
    if (OUTCOMES.every((o) => Number.isFinite(fair(r, o)) && fair(r, o) > 0)) {
      const s = sums.get(id) ?? { n: 0, p: { HOME: 0, DRAW: 0, AWAY: 0 } };
      s.n += 1;
      for (const o of OUTCOMES) s.p[o] += fair(r, o);
      sums.set(id, s);
    }
    if (r.italian_market) {
      for (const o of OUTCOMES) {
        const p = price(r, o);
        const best = m.italian[o];
        if (Number.isFinite(p) && p > 1 && (!best || p > best.price)) {
          m.italian[o] = { price: p, bookmaker: r.bookmaker };
        }
      }
    }
  }
  for (const [id, s] of sums) {
    const m = result.get(id)!;
    for (const o of OUTCOMES) m.consensus[o] = s.p[o] / s.n;
  }
  return result;
}

/** Probabilità usata: media pesata modello/mercato; senza consenso resta quella del modello. */
export function usedProbability(model: number, market: number | undefined, weight: number) {
  return market === undefined ? model : (1 - weight) * model + weight * market;
}
