import { roundStartOf } from "./format";
import {
  italianPriceFor,
  LIKELY_MARKETS,
  MAX_PICK_PROBABILITY,
  MIN_CONFIDENCE,
  type ItalianPrice,
  type LikelyPick,
  type LikelyRow,
} from "./likely";

/*
 * "Schedine consigliate": per ogni turno, una multipla giocabile per profilo di rischio.
 *
 * Differenza da "Le più probabili": lì si prende il pronostico più probabile di ogni
 * partita, che spesso ha una quota troppo bassa per valere la giocata. Qui ogni
 * selezione deve avere insieme una probabilità minima E una quota reale minima, quindi
 * la bolletta paga davvero.
 *
 * Regole (nessun dato inventato, nessuna schedina forzata):
 * - solo selezioni con una quota REALE di un bookmaker italiano (ADR 0028): la quota
 *   totale è il prodotto delle quote reali;
 * - probabilità del modello attivo, con affidabilità almeno `MIN_CONFIDENCE`;
 * - controllo di credibilità: se modello e bookmaker sono troppo distanti (vantaggio
 *   oltre `MAX_EDGE`, come nei casi dell'ADR 0028, o sotto `MIN_EDGE`) la selezione è
 *   scartata;
 * - una selezione per partita, squadre tutte diverse, stesso turno (ADR 0026, 0036);
 * - per ogni partita si sceglie la selezione più probabile tra quelle che rispettano
 *   le soglie del profilo; tra le partite, le più probabili;
 * - se le selezioni valide sono meno di `MIN_LEGS`, quel profilo non viene proposto.
 */

export const BOLLETTA_PROFILES = ["SOLID", "BALANCED", "HIGH"] as const;
export type BollettaProfile = (typeof BOLLETTA_PROFILES)[number];

export interface BollettaRule {
  /** Probabilità minima di ogni selezione. */
  minProbability: number;
  /** Quota reale minima di ogni selezione. */
  minPrice: number;
  /** Selezioni al massimo. */
  legs: number;
}

export const BOLLETTA_RULES: Readonly<Record<BollettaProfile, BollettaRule>> = {
  SOLID: { minProbability: 0.65, minPrice: 1.25, legs: 3 },
  BALANCED: { minProbability: 0.55, minPrice: 1.45, legs: 4 },
  HIGH: { minProbability: 0.42, minPrice: 1.8, legs: 4 },
};

/** Vantaggio = probabilità × quota − 1. Fuori da questo intervallo la selezione è scartata. */
export const MIN_EDGE = -0.08;
export const MAX_EDGE = 0.2;
export const MIN_LEGS = 2;

export interface BollettaPick extends LikelyPick {
  price: number;
  bookmaker: string;
  /** Quando è stata letta la quota. */
  observedAt: string;
  /** probabilità × quota − 1. */
  edge: number;
}

export interface Bolletta {
  profile: BollettaProfile;
  /** Inizio del turno (venerdì o martedì), "YYYY-MM-DD". */
  round: string;
  picks: BollettaPick[];
  /** Prodotto delle probabilità (indipendenza dichiarata, ADR 0026 §2). */
  probability: number;
  /** Lettura più vecchia tra le quote usate: la bolletta è aggiornata quanto questa. */
  oddsObservedAt: string;
  /** Prodotto delle quote reali. */
  price: number;
}

const ROME_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Turno della partita, dalla data del calcio d'inizio nel fuso di Roma. */
export function roundOfKickoff(kickoffAt: string): string {
  return roundStartOf(ROME_DAY.format(new Date(kickoffAt)));
}

function allowedMarket(row: LikelyRow): boolean {
  const lines = LIKELY_MARKETS[row.market];
  if (!lines) return false;
  const line = row.line === null ? null : Number(row.line);
  return lines.some((l) => l === line);
}

/** Selezioni giocabili e credibili: quota italiana reale e vantaggio nell'intervallo ammesso. */
export function playablePicks(
  rows: readonly LikelyRow[],
  prices: ReadonlyMap<string, ItalianPrice>,
): BollettaPick[] {
  const result: BollettaPick[] = [];
  for (const r of rows) {
    const probability = Number(r.probability);
    const confidence = Number(r.confidence_score);
    if (!allowedMarket(r) || confidence < MIN_CONFIDENCE) continue;
    if (!(probability > 0) || probability > MAX_PICK_PROBABILITY) continue;
    const pick: LikelyPick = {
      matchId: Number(r.match_id),
      kickoffAt: r.kickoff_at,
      home: r.home_team_name,
      away: r.away_team_name,
      market: r.market,
      line: r.line === null ? null : Number(r.line),
      selection: r.selection,
      probability,
      confidence,
    };
    const it = italianPriceFor(prices, pick);
    if (!it || !(it.price > 1)) continue;
    const edge = probability * it.price - 1;
    if (edge < MIN_EDGE || edge > MAX_EDGE) continue;
    result.push({
      ...pick,
      price: it.price,
      bookmaker: it.bookmaker,
      observedAt: it.observedAt,
      edge,
    });
  }
  return result;
}

const byStrength = (a: BollettaPick, b: BollettaPick) =>
  b.probability - a.probability ||
  b.edge - a.edge ||
  a.kickoffAt.localeCompare(b.kickoffAt) ||
  a.matchId - b.matchId;

function buildOne(
  profile: BollettaProfile,
  round: string,
  pool: readonly BollettaPick[],
): Bolletta | null {
  const rule = BOLLETTA_RULES[profile];
  // La selezione più probabile di ogni partita tra quelle che rispettano il profilo.
  const perMatch = new Map<number, BollettaPick>();
  for (const p of pool) {
    if (p.probability < rule.minProbability || p.price < rule.minPrice) continue;
    const current = perMatch.get(p.matchId);
    if (!current || byStrength(p, current) < 0) perMatch.set(p.matchId, p);
  }
  const chosen: BollettaPick[] = [];
  const teams = new Set<string>();
  for (const p of [...perMatch.values()].sort(byStrength)) {
    if (chosen.length >= rule.legs) break;
    if (teams.has(p.home) || teams.has(p.away)) continue;
    teams.add(p.home).add(p.away);
    chosen.push(p);
  }
  if (chosen.length < MIN_LEGS) return null;
  return {
    profile,
    round,
    picks: chosen.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.matchId - b.matchId),
    oddsObservedAt: chosen.map((p) => p.observedAt).sort()[0] ?? "",
    probability: chosen.reduce((acc, p) => acc * p.probability, 1),
    price: chosen.reduce((acc, p) => acc * p.price, 1),
  };
}

const signature = (b: Bolletta) =>
  b.picks.map((p) => `${p.matchId}|${p.market}|${p.line}|${p.selection}`).join(";");

/** Bollette per turno (dal più vicino) e profilo; senza doppioni nello stesso turno. */
export function buildBollette(
  rows: readonly LikelyRow[],
  prices: ReadonlyMap<string, ItalianPrice>,
): Bolletta[] {
  const byRound = new Map<string, BollettaPick[]>();
  for (const p of playablePicks(rows, prices)) {
    const round = roundOfKickoff(p.kickoffAt);
    byRound.set(round, [...(byRound.get(round) ?? []), p]);
  }
  const result: Bolletta[] = [];
  for (const round of [...byRound.keys()].sort()) {
    const seen = new Set<string>();
    for (const profile of BOLLETTA_PROFILES) {
      const bolletta = buildOne(profile, round, byRound.get(round) ?? []);
      if (!bolletta || seen.has(signature(bolletta))) continue;
      seen.add(signature(bolletta));
      result.push(bolletta);
    }
  }
  return result;
}

/** Oltre questa età la quota va ricontrollata dal bookmaker (12 ore, come la freschezza delle quote). */
export const ODDS_MAX_AGE_MS = 12 * 3_600_000;

export function oddsAreOld(bolletta: Pick<Bolletta, "oddsObservedAt">, now: Date): boolean {
  const observed = new Date(bolletta.oddsObservedAt).getTime();
  return !Number.isFinite(observed) || now.getTime() - observed > ODDS_MAX_AGE_MS;
}
