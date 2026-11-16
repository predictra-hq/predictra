/*
 * "Le più probabili": per ogni partita il pronostico con la probabilità più alta del
 * modello attivo, su più tipi di giocata, e le multiple più probabili che se ne ricavano.
 *
 * - Solo probabilità del modello (mai da un LLM). Nessuna quota inventata: la "quota
 *   equa" è 1/p, non una quota di bookmaker.
 * - Mercati e linee ammessi: quelli comuni e leggibili. Si escludono i pronostici quasi
 *   certi (oltre `MAX_PICK_PROBABILITY`, es. over 0,5) che non direbbero nulla, e quelli
 *   con Confidence Score sotto la soglia del Bet Builder (ADR 0025).
 * - Multipla di k partite: i k pronostici più probabili su partite diverse. Con
 *   l'indipendenza dichiarata (ADR 0026 §2) è la multipla di k selezioni più probabile.
 *   Se ne propone una per categoria di rischio: la più lunga che resta sopra la soglia.
 */

import {
  BET_PROPOSAL_CATEGORIES,
  CATEGORY_MIN_PROBABILITY,
  DEFAULT_BET_BUILDER_RULES,
  type BetProposalCategory,
} from "@predictra/shared-types";

export const LIKELY_MARKETS: Readonly<Record<string, readonly (number | null)[]>> = {
  "1X2": [null],
  DOUBLE_CHANCE: [null],
  BTTS: [null],
  TOTAL_GOALS: [1.5, 2.5, 3.5],
  TEAM_GOALS: [0.5, 1.5],
};
export const MAX_PICK_PROBABILITY = 0.9;
export const MIN_PICK_PROBABILITY = 0.5;
export const MIN_CONFIDENCE = 0.4;
export const MIN_MULTIPLE_LEGS = 2;
/** Oltre queste partite la multipla non si allunga più, anche se la soglia lo permetterebbe. */
export const MAX_MULTIPLE_LEGS = 12;
/** Probabilità combinata minima della multipla di ogni categoria (ADR 0027 §3, ADR 0025). */
export const MULTIPLE_MIN_PROBABILITY: Readonly<Record<BetProposalCategory, number>> = {
  CONSERVATIVE: CATEGORY_MIN_PROBABILITY.CONSERVATIVE,
  BALANCED: CATEGORY_MIN_PROBABILITY.BALANCED,
  AGGRESSIVE: DEFAULT_BET_BUILDER_RULES.min_probability,
};

export interface LikelyRow {
  match_id: number;
  kickoff_at: string;
  home_team_name: string;
  away_team_name: string;
  market: string;
  line: number | null;
  selection: string;
  probability: number;
  confidence_score: number;
}

export interface LikelyPick {
  matchId: number;
  kickoffAt: string;
  home: string;
  away: string;
  market: string;
  line: number | null;
  selection: string;
  probability: number;
  confidence: number;
}

/** Migliore quota reale di un bookmaker italiano per il pronostico (se raccolta). */
export interface ItalianPrice {
  price: number;
  bookmaker: string;
  observedAt: string;
}

/** Mercato di quote corrispondente (ADR 0029): 1X2 → h2h, Totale gol 2,5 → totals_2_5. */
export function oddsMarketFor(market: string, line: number | null): string | null {
  if (market === "1X2" && line === null) return "h2h";
  if (market === "DOUBLE_CHANCE" && line === null) return "double_chance";
  if (market === "TOTAL_GOALS" && line !== null && [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].includes(line)) {
    return `totals_${Math.floor(line)}_5`;
  }
  return null;
}

export interface LatestOddsRow {
  match_id: number | null;
  bookmaker: string;
  market: string;
  selection: string;
  price: number;
  observed_at: string;
  /** Bookmaker italiano (quota giocabile). Assente = trattata come italiana. */
  italian?: boolean;
}

/**
 * Quota italiana per (partita, mercato, esito), tra le righe già filtrate: quella del
 * bookmaker dell'utente (`preferred`, il sito del suo bankroll) quando c'è, altrimenti la
 * migliore tra i bookmaker italiani.
 */
export function bestItalianPrices(
  rows: readonly LatestOddsRow[],
  preferred: string | null = null,
): Map<string, ItalianPrice> {
  const best = new Map<string, ItalianPrice>();
  for (const r of rows) {
    if (r.match_id === null || r.italian === false) continue;
    const key = `${r.match_id}|${r.market}|${r.selection}`;
    const price = Number(r.price);
    const cur = best.get(key);
    const mine = preferred !== null && r.bookmaker === preferred;
    const curMine = preferred !== null && cur?.bookmaker === preferred;
    if (!cur || (mine && !curMine) || (mine === curMine && price > cur.price)) {
      best.set(key, { price, bookmaker: r.bookmaker, observedAt: r.observed_at });
    }
  }
  return best;
}

export function italianPriceFor(
  prices: ReadonlyMap<string, ItalianPrice>,
  pick: Pick<LikelyPick, "matchId" | "market" | "line" | "selection">,
): ItalianPrice | null {
  const market = oddsMarketFor(pick.market, pick.line);
  if (!market) return null;
  return prices.get(`${pick.matchId}|${market}|${pick.selection}`) ?? null;
}

/** Quota reale combinata se ogni pronostico ha una quota italiana, altrimenti null. */
export function combinedItalianPrice(
  prices: ReadonlyMap<string, ItalianPrice>,
  picks: readonly Pick<LikelyPick, "matchId" | "market" | "line" | "selection">[],
): number | null {
  let product = 1;
  for (const p of picks) {
    const it = italianPriceFor(prices, p);
    if (!it) return null;
    product *= it.price;
  }
  return product;
}

export interface LikelyMultiple {
  category: BetProposalCategory;
  size: number;
  /** Pronostici ordinati per tipo di giocata, poi per calcio d'inizio. */
  picks: LikelyPick[];
  probability: number;
  fairOdds: number;
  confidence: number;
}

function allowed(row: LikelyRow): boolean {
  const lines = LIKELY_MARKETS[row.market];
  if (!lines) return false;
  const line = row.line === null ? null : Number(row.line);
  return lines.some((l) => l === line);
}

/** Il pronostico più probabile di ogni partita, in ordine di probabilità decrescente. */
export function bestPicks(rows: readonly LikelyRow[]): LikelyPick[] {
  const best = new Map<number, LikelyPick>();
  for (const r of rows) {
    const p = Number(r.probability);
    const c = Number(r.confidence_score);
    if (!allowed(r) || p > MAX_PICK_PROBABILITY || p < MIN_PICK_PROBABILITY) continue;
    if (c < MIN_CONFIDENCE) continue;
    const id = Number(r.match_id);
    const current = best.get(id);
    if (
      current &&
      (current.probability > p || (current.probability === p && current.confidence >= c))
    )
      continue;
    best.set(id, {
      matchId: id,
      kickoffAt: r.kickoff_at,
      home: r.home_team_name,
      away: r.away_team_name,
      market: r.market,
      line: r.line === null ? null : Number(r.line),
      selection: r.selection,
      probability: p,
      confidence: c,
    });
  }
  return [...best.values()].sort(
    (a, b) =>
      b.probability - a.probability ||
      b.confidence - a.confidence ||
      a.kickoffAt.localeCompare(b.kickoffAt),
  );
}

/**
 * Una multipla per categoria di rischio (ADR 0027 §3): la più lunga, fatta dei pronostici
 * più probabili su partite diverse, la cui probabilità combinata resta sopra la soglia
 * della categoria. Più partite → probabilità più bassa → categoria più rischiosa.
 * Una categoria non compare se non riesce ad aggiungere partite rispetto alla precedente
 * o se nemmeno due pronostici restano sopra la sua soglia.
 */
export function likelyMultiples(picks: readonly LikelyPick[]): LikelyMultiple[] {
  const out: LikelyMultiple[] = [];
  let previousSize = 0;
  for (const category of BET_PROPOSAL_CATEGORIES) {
    const floor = MULTIPLE_MIN_PROBABILITY[category];
    let size = 0;
    let probability = 1;
    for (const p of picks.slice(0, MAX_MULTIPLE_LEGS)) {
      if (probability * p.probability < floor) break;
      probability *= p.probability;
      size += 1;
    }
    if (size < MIN_MULTIPLE_LEGS || size <= previousSize) continue;
    previousSize = size;
    const chosen = picks.slice(0, size);
    out.push({
      category,
      size,
      picks: [...chosen].sort(
        (a, b) =>
          marketOrder(a.market) - marketOrder(b.market) || a.kickoffAt.localeCompare(b.kickoffAt),
      ),
      probability,
      fairOdds: 1 / probability,
      confidence: Math.min(...chosen.map((p) => p.confidence)),
    });
  }
  return out;
}

/** Posizione del tipo di giocata nell'ordine di `LIKELY_MARKETS`. */
function marketOrder(market: string): number {
  const i = Object.keys(LIKELY_MARKETS).indexOf(market);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
