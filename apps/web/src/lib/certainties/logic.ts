import type { ActivePredictionRow, PredictionMarket } from "@predictra/shared-types";

/*
 * Certezze: le giocate a probabilità alta del modello attivo, su tutti i mercati con esito
 * secco (niente rimborso). Le probabilità sono quelle del motore (regola 5): qui si
 * filtrano, si tolgono i doppioni e si verifica quante volte la stessa fascia è uscita.
 */

/**
 * Mercati giocabili con quote italiane e con esito secco: 1X2, doppia chance,
 * under/over e gol/no gol. Le linee estreme (Over 0,5, Under 4,5) sono quasi sempre
 * vere ma a quote che non fanno guadagnare: restano fuori.
 */
export const CERTAINTY_MARKETS: readonly PredictionMarket[] = [
  "1X2",
  "DOUBLE_CHANCE",
  "TOTAL_GOALS",
  "BTTS",
];
export const TOTAL_LINES: readonly number[] = [1.5, 2.5, 3.5];
/** Giocate mostrate per partita: le più probabili. */
export const MAX_PICKS_PER_MATCH = 3;

export const THRESHOLDS = [0.7, 0.75, 0.8, 0.85, 0.9] as const;
export const DEFAULT_THRESHOLD = 0.75;

/** Fasce della verifica: [da, a). L'ultima comprende il 100%. */
export const BANDS: readonly (readonly [number, number])[] = [
  [0.7, 0.75],
  [0.75, 0.8],
  [0.8, 0.85],
  [0.85, 0.9],
  [0.9, 1.0001],
];

export interface Pick {
  matchId: number;
  competitionId?: number;
  kickoffAt: string;
  home: string;
  away: string;
  market: PredictionMarket;
  line: number | null;
  selection: string;
  /** Probabilità usata: combinata modello/mercato se ci sono quote, altrimenti del modello. */
  probability: number;
  modelProbability: number;
  /** Probabilità del mercato senza margine (consenso dei bookmaker), se raccolta. */
  marketProbability: number | null;
  confidence: number;
}

/** Probabilità del mercato per una previsione, se ci sono quote (`null` altrimenti). */
export type MarketLookup = (row: ActivePredictionRow) => number | null;

const noMarket: MarketLookup = () => null;

/** Peso del mercato nella probabilità combinata (ADR 0028), come nel Bet Builder. */
export const DEFAULT_MARKET_WEIGHT = 0.5;

export function combinedProbability(
  model: number,
  market: number | null,
  weight: number = DEFAULT_MARKET_WEIGHT,
): number {
  return market === null ? model : (1 - weight) * model + weight * market;
}

/** Soglia dalla query string (`?soglia=80`); valori non previsti → predefinita. */
export function parseThreshold(value: unknown): number {
  const n = Number(Array.isArray(value) ? value[0] : value) / 100;
  return (THRESHOLDS as readonly number[]).find((t) => Math.abs(t - n) < 1e-9) ?? DEFAULT_THRESHOLD;
}

/** Giocate ammesse tra le certezze: mercati scelti, linee dei gol previste. */
export function isEligible(row: ActivePredictionRow): boolean {
  if (!CERTAINTY_MARKETS.includes(row.market)) return false;
  if (row.market === "TOTAL_GOALS") return TOTAL_LINES.includes(Number(row.line));
  return row.line === null;
}

export function toPick(
  row: ActivePredictionRow,
  market: MarketLookup = noMarket,
  weight: number = DEFAULT_MARKET_WEIGHT,
): Pick {
  const modelProbability = Number(row.probability);
  const marketProbability = market(row);
  return {
    matchId: row.match_id,
    competitionId: row.competition_id,
    kickoffAt: row.kickoff_at,
    home: row.home_team_name,
    away: row.away_team_name,
    market: row.market,
    line: row.line === null ? null : Number(row.line),
    selection: row.selection,
    probability: combinedProbability(modelProbability, marketProbability, weight),
    modelProbability,
    marketProbability,
    confidence: Number(row.confidence_score),
  };
}

/** Selezioni dell'1X2 contenute in una doppia chance. */
const DOUBLE_CHANCE_PARTS: Record<string, readonly string[]> = {
  HOME_DRAW: ["HOME", "DRAW"],
  HOME_AWAY: ["HOME", "AWAY"],
  DRAW_AWAY: ["DRAW", "AWAY"],
};

/**
 * Vero se `b` è implicata da `a` (vince sempre quando vince `a`), quindi è un doppione
 * meno informativo: Over 0,5 rispetto a Over 1,5, 1X rispetto a 1, e così via.
 */
export function implies(a: Pick, b: Pick): boolean {
  if (a.matchId !== b.matchId) return false;
  if (a.market === "1X2" && b.market === "DOUBLE_CHANCE") {
    return DOUBLE_CHANCE_PARTS[b.selection]?.includes(a.selection) ?? false;
  }
  if (a.market !== b.market || a.selection !== b.selection || a.line === b.line) return false;
  if (a.line === null || b.line === null) return false;
  const over = a.selection.endsWith("OVER");
  return over ? a.line > b.line : a.line < b.line;
}

/** Giocate sopra soglia, senza doppioni, ordinate per calcio d'inizio e probabilità. */
export function selectPicks(
  rows: readonly ActivePredictionRow[],
  threshold: number,
  market: MarketLookup = noMarket,
  weight: number = DEFAULT_MARKET_WEIGHT,
): Pick[] {
  const candidates = rows
    .filter(isEligible)
    .map((r) => toPick(r, market, weight))
    .filter((p) => p.probability >= threshold);
  const kept = candidates.filter((b) => !candidates.some((a) => a !== b && implies(a, b)));
  // Al massimo MAX_PICKS_PER_MATCH per partita, le più probabili.
  const perMatch = new Map<number, Pick[]>();
  for (const p of kept) perMatch.set(p.matchId, [...(perMatch.get(p.matchId) ?? []), p]);
  const limited = [...perMatch.values()].flatMap((list) =>
    list.sort((a, b) => b.probability - a.probability).slice(0, MAX_PICKS_PER_MATCH),
  );
  return limited.sort(
    (a, b) =>
      a.kickoffAt.localeCompare(b.kickoffAt) ||
      a.matchId - b.matchId ||
      b.probability - a.probability,
  );
}

export interface MatchPicks {
  matchId: number;
  competitionId?: number;
  kickoffAt: string;
  home: string;
  away: string;
  picks: Pick[];
}

export function groupByMatch(picks: readonly Pick[]): MatchPicks[] {
  const groups = new Map<number, MatchPicks>();
  for (const p of picks) {
    const g = groups.get(p.matchId) ?? {
      matchId: p.matchId,
      competitionId: p.competitionId,
      kickoffAt: p.kickoffAt,
      home: p.home,
      away: p.away,
      picks: [],
    };
    g.picks.push(p);
    groups.set(p.matchId, g);
  }
  return [...groups.values()];
}

/**
 * Partite raggruppate per competizione, nell'ordine dato da `order` (gli id delle
 * competizioni già ordinate); le competizioni sconosciute vanno in fondo.
 */
export function groupByCompetition<T extends { competitionId?: number }>(
  matches: readonly T[],
  order: readonly number[],
): { competitionId: number | null; matches: T[] }[] {
  const groups = new Map<number | null, T[]>();
  for (const m of matches) {
    const key = m.competitionId ?? null;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const rank = (id: number | null) => {
    const i = id === null ? -1 : order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([competitionId, list]) => ({ competitionId, matches: list }));
}

/** Esito di una selezione dato il risultato al 90'; `null` se non risolvibile qui. */
export function settle(
  market: PredictionMarket,
  line: number | null,
  selection: string,
  home: number,
  away: number,
): boolean | null {
  const outcome = home > away ? "HOME" : home === away ? "DRAW" : "AWAY";
  switch (market) {
    case "1X2":
      return selection === outcome;
    case "DOUBLE_CHANCE":
      return DOUBLE_CHANCE_PARTS[selection]?.includes(outcome) ?? null;
    case "BTTS":
      return selection === "YES" ? home > 0 && away > 0 : !(home > 0 && away > 0);
    case "TOTAL_GOALS":
      if (line === null) return null;
      return selection === "OVER" ? home + away > line : home + away < line;
    case "TEAM_GOALS": {
      if (line === null) return null;
      const goals = selection.startsWith("HOME") ? home : away;
      return selection.endsWith("OVER") ? goals > line : goals < line;
    }
    default:
      return null;
  }
}

export interface BandStat {
  from: number;
  to: number;
  count: number;
  wins: number;
  /** Probabilità media prevista nella fascia. */
  predicted: number | null;
  /** Frequenza osservata; `null` senza partite. */
  observed: number | null;
}

/** Verifica per fascia sulle partite già giocate (una riga per selezione). */
export function bandStats(
  rows: readonly ActivePredictionRow[],
  results: ReadonlyMap<number, { home: number; away: number }>,
  market: MarketLookup = noMarket,
  weight: number = DEFAULT_MARKET_WEIGHT,
): BandStat[] {
  const stats = BANDS.map(([from, to]) => ({ from, to, count: 0, wins: 0, sum: 0 }));
  for (const r of rows) {
    if (!isEligible(r)) continue;
    const score = results.get(r.match_id);
    if (!score) continue;
    const p = combinedProbability(Number(r.probability), market(r), weight);
    const band = stats.find((b) => p >= b.from && p < b.to);
    if (!band) continue;
    const won = settle(
      r.market,
      r.line === null ? null : Number(r.line),
      r.selection,
      score.home,
      score.away,
    );
    if (won === null) continue;
    band.count += 1;
    band.sum += p;
    if (won) band.wins += 1;
  }
  return stats.map(({ from, to, count, wins, sum }) => ({
    from,
    to: Math.min(to, 1),
    count,
    wins,
    predicted: count ? sum / count : null,
    observed: count ? wins / count : null,
  }));
}

export interface CertaintyMultiple {
  picks: Pick[];
  /** Probabilità di vincere tutte le giocate (partite diverse, trattate come indipendenti). */
  probability: number;
}

/** Traguardo della multipla: probabilità minima di vincerla tutta. */
export const MULTIPLE_TARGET = 0.7;
export const MAX_MULTIPLE_LEGS = 10;

/**
 * Multipla con le giocate più forti, una per partita: si aggiungono dalla più probabile
 * finché la probabilità complessiva resta almeno `target`. Servono almeno due partite.
 */
export function buildMultiple(
  picks: readonly Pick[],
  target: number,
  maxLegs: number = MAX_MULTIPLE_LEGS,
): CertaintyMultiple | null {
  const best = new Map<number, Pick>();
  for (const p of picks) {
    const cur = best.get(p.matchId);
    if (!cur || p.probability > cur.probability) best.set(p.matchId, p);
  }
  const ordered = [...best.values()].sort((a, b) => b.probability - a.probability);
  const legs: Pick[] = [];
  let probability = 1;
  for (const p of ordered) {
    if (legs.length >= maxLegs || probability * p.probability < target) break;
    legs.push(p);
    probability *= p.probability;
  }
  return legs.length >= 2 ? { picks: legs, probability } : null;
}

export interface PastMultiple {
  /** Lunedì della settimana (UTC, AAAA-MM-GG). */
  week: string;
  target: number;
  legs: number;
  probability: number;
  won: boolean;
}

/** Lunedì (UTC) della settimana di un calcio d'inizio. */
export function weekOf(kickoffAt: string): string {
  const d = new Date(kickoffAt);
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Multiple che la pagina avrebbe proposto ogni settimana, con le previsioni fatte prima
 * delle partite, e il loro esito reale.
 */
export function pastMultiples(
  rows: readonly ActivePredictionRow[],
  results: ReadonlyMap<number, { home: number; away: number }>,
  threshold: number,
  market: MarketLookup = noMarket,
  weight: number = DEFAULT_MARKET_WEIGHT,
): PastMultiple[] {
  const byWeek = new Map<string, ActivePredictionRow[]>();
  for (const r of rows) {
    if (!results.has(r.match_id)) continue;
    const week = weekOf(r.kickoff_at);
    byWeek.set(week, [...(byWeek.get(week) ?? []), r]);
  }
  const out: PastMultiple[] = [];
  for (const [week, weekRows] of [...byWeek.entries()].sort()) {
    const picks = selectPicks(weekRows, threshold, market, weight);
    for (const target of [MULTIPLE_TARGET]) {
      const multiple = buildMultiple(picks, target);
      if (!multiple) continue;
      const won = multiple.picks.every((p) => {
        const score = results.get(p.matchId)!;
        return settle(p.market, p.line, p.selection, score.home, score.away) === true;
      });
      out.push({
        week,
        target,
        legs: multiple.picks.length,
        probability: multiple.probability,
        won,
      });
    }
  }
  return out;
}

/** Quota reale giocabile per una giocata (`null` se non raccolta). */
export type PriceLookup = (pick: Pick) => number | null;

/** Traguardo della multipla con valore: abbastanza probabile da vincere spesso. */
export const VALUE_MULTIPLE_TARGET = 0.5;
/** Vantaggio minimo di ogni giocata: probabilità × quota − 1. */
export const MIN_LEG_VALUE = 0;

export interface ValueMultiple extends CertaintyMultiple {
  /** Quota reale combinata. */
  price: number;
  /** Valore atteso: probabilità × quota − 1. */
  value: number;
}

/**
 * Multipla che vince spesso e conviene: solo giocate con quota reale sopra il giusto,
 * una per partita, dalla più probabile, finché la multipla resta sopra `target`.
 */
export function buildValueMultiple(
  picks: readonly Pick[],
  priceFor: PriceLookup,
  target: number = VALUE_MULTIPLE_TARGET,
  maxLegs: number = MAX_MULTIPLE_LEGS,
): ValueMultiple | null {
  const best = new Map<number, { pick: Pick; price: number }>();
  for (const p of picks) {
    const price = priceFor(p);
    if (price === null || p.probability * price - 1 < MIN_LEG_VALUE) continue;
    const cur = best.get(p.matchId);
    if (!cur || p.probability > cur.pick.probability) best.set(p.matchId, { pick: p, price });
  }
  const ordered = [...best.values()].sort((a, b) => b.pick.probability - a.pick.probability);
  const legs: Pick[] = [];
  let probability = 1;
  let price = 1;
  for (const { pick, price: legPrice } of ordered) {
    if (legs.length >= maxLegs || probability * pick.probability < target) break;
    legs.push(pick);
    probability *= pick.probability;
    price *= legPrice;
  }
  if (legs.length < 2) return null;
  return { picks: legs, probability, price, value: probability * price - 1 };
}

export interface PastValueMultiple {
  week: string;
  legs: number;
  probability: number;
  price: number;
  won: boolean;
}

/** Multiple con valore ricostruite per settimana, con le quote raccolte prima delle partite. */
export function pastValueMultiples(
  rows: readonly ActivePredictionRow[],
  results: ReadonlyMap<number, { home: number; away: number }>,
  threshold: number,
  priceFor: PriceLookup,
  market: MarketLookup = noMarket,
  weight: number = DEFAULT_MARKET_WEIGHT,
): PastValueMultiple[] {
  const byWeek = new Map<string, ActivePredictionRow[]>();
  for (const r of rows) {
    if (!results.has(r.match_id)) continue;
    const week = weekOf(r.kickoff_at);
    byWeek.set(week, [...(byWeek.get(week) ?? []), r]);
  }
  const out: PastValueMultiple[] = [];
  for (const [week, weekRows] of [...byWeek.entries()].sort()) {
    const multiple = buildValueMultiple(selectPicks(weekRows, threshold, market, weight), priceFor);
    if (!multiple) continue;
    const won = multiple.picks.every((p) => {
      const score = results.get(p.matchId)!;
      return settle(p.market, p.line, p.selection, score.home, score.away) === true;
    });
    out.push({
      week,
      legs: multiple.picks.length,
      probability: multiple.probability,
      price: multiple.price,
      won,
    });
  }
  return out;
}

/** Rendimento a puntata fissa (1 per multipla): (vincite − puntate) ÷ puntate. */
export function flatReturn(multiples: readonly { won: boolean; price: number }[]): number | null {
  if (multiples.length === 0) return null;
  const payout = multiples.reduce((sum, m) => sum + (m.won ? m.price : 0), 0);
  return payout / multiples.length - 1;
}

/** Traguardi delle multiple mostrate: dalla più sicura (poche partite) alla più ricca. */
export const MULTIPLE_TARGETS = [0.75, 0.65, 0.55, 0.45] as const;

export type CertaintyMultipleCard =
  | { key: string; kind: "target"; target: number; multiple: CertaintyMultiple }
  | { key: string; kind: "value"; target: null; multiple: ValueMultiple };

/**
 * Le multiple della pagina Certezze: una per traguardo (senza doppioni: due traguardi
 * possono dare la stessa multipla) e quella con valore, se c'è.
 */
export function certaintyMultiples(
  picks: readonly Pick[],
  priceFor: PriceLookup,
): CertaintyMultipleCard[] {
  const out: CertaintyMultipleCard[] = [];
  const seen = new Set<string>();
  const signature = (m: CertaintyMultiple) =>
    m.picks
      .map((p) => `${p.matchId}|${p.market}|${p.line ?? ""}|${p.selection}`)
      .sort()
      .join(",");
  for (const target of MULTIPLE_TARGETS) {
    const multiple = buildMultiple(picks, target);
    if (!multiple || seen.has(signature(multiple))) continue;
    seen.add(signature(multiple));
    out.push({ key: `t${target}`, kind: "target", target, multiple });
  }
  const value = buildValueMultiple(picks, priceFor);
  if (value && !seen.has(signature(value))) {
    out.push({ key: "value", kind: "value", target: null, multiple: value });
  }
  return out;
}

export interface WeekHits {
  /** Lunedì della settimana (AAAA-MM-GG, UTC). */
  weekStart: string;
  count: number;
  wins: number;
}

function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Giocate dalla soglia in su sulle partite già giocate, settimana per settimana: quante
 * erano e quante sono uscite. Le ultime `weeks` settimane, dalla più vecchia, anche vuote.
 */
export function weeklyHits(
  rows: readonly ActivePredictionRow[],
  results: ReadonlyMap<number, { home: number; away: number }>,
  threshold: number,
  market: MarketLookup = noMarket,
  weeks = 6,
  now: Date = new Date(),
): WeekHits[] {
  const out = new Map<string, WeekHits>();
  const current = new Date(`${mondayOf(now)}T00:00:00Z`);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(current.getTime() - i * 7 * 86_400_000).toISOString().slice(0, 10);
    out.set(start, { weekStart: start, count: 0, wins: 0 });
  }
  const played = rows.filter((r) => results.has(r.match_id));
  for (const p of selectPicks(played, threshold, market)) {
    const week = out.get(mondayOf(new Date(p.kickoffAt)));
    const score = results.get(p.matchId);
    if (!week || !score) continue;
    const won = settle(p.market, p.line, p.selection, score.home, score.away);
    if (won === null) continue;
    week.count += 1;
    if (won) week.wins += 1;
  }
  return [...out.values()];
}
