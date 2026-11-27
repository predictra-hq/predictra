import { demargin, type DemarginMethod } from "@predictra/quant";
import { MARKET_WEIGHT } from "./weight";
import { calibrate, type Calibration } from "./calibration";
import { roundStartOf } from "./format";
import {
  italianPriceFor,
  LIKELY_MARKETS,
  oddsMarketFor,
  type LatestOddsRow,
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
 * - probabilità prudente, come nelle proposte con valore (ADR 0028): media tra quella
 *   del modello attivo (affidabilità almeno `MIN_CONFIDENCE`) e quella del mercato senza
 *   margine, calcolata dalle quote di tutti i bookmaker (`marketConsensus`). Senza quote
 *   di mercato resta quella del modello;
 * - valore = probabilità × quota − 1: si scartano le quote troppo basse (sotto
 *   `MIN_EDGE`, il bookmaker paga meno del giusto) e i valori non credibili (sopra
 *   `MAX_EDGE`: modello e mercato troppo distanti, casi dell'ADR 0028);
 * - una selezione per partita, squadre tutte diverse, stesso turno (ADR 0026, 0036);
 * - per ogni partita, tra le selezioni che rispettano probabilità e quota minime del
 *   profilo, si sceglie quella con il valore più alto: "sicura" per la soglia, con il
 *   margine migliore tra quelle sicure. Tra le partite, prima quelle con più valore;
 * - il valore dell'intera schedina non scende sotto `MIN_SLIP_VALUE` (zero): una selezione
 *   che lo porterebbe sotto non entra. Meglio una schedina in meno che una che in media
 *   fa perdere;
 * - se le selezioni valide sono meno di `MIN_LEGS`, quel profilo non viene proposto.
 *
 * Precisione (ADR 0065):
 * - la probabilità del modello si corregge con la verifica storica del suo mercato e della
 *   sua fascia (`calibration.ts`): un mercato che in passato è uscito meno del previsto
 *   pesa meno;
 * - modello e mercato devono essere d'accordo: oltre `MAX_DISAGREEMENT` punti di distanza
 *   uno dei due sbaglia e la giocata non entra;
 * - si sceglie prima la precisione, poi il valore: punteggio = probabilità + valore;
 * - niente più schedina lunga a 6 partite: con sei esiti al 55% vince meno di 3 volte su 100.
 */

/*
 * ADR 0071 e 0072: tre schedine per periodo, una per tipo: Solida, Equilibrata e Alta
 * quota. Ognuna ha una quota totale minima (3, 5 e 10): si aggiungono partite finché la si
 * raggiunge. Se le giocate non bastano, le soglie si allentano un po' alla volta
 * (`RELAX_STEPS`); se nemmeno così si arriva alla quota, quella schedina non si propone.
 */
export const BOLLETTA_PROFILES = ["SOLID", "BALANCED", "HIGH"] as const;
/** Profili con cui si costruiscono oggi le schedine (ADR 0071). */
export type BuiltProfile = (typeof BOLLETTA_PROFILES)[number];
/** Anche «DOUBLE» (Doppia, fino al 25/11/2026): resta nelle schedine già salvate. */
export type BollettaProfile = BuiltProfile | "DOUBLE";

export interface BollettaRule {
  /** Probabilità minima di ogni selezione. */
  minProbability: number;
  /** Quota reale minima di ogni selezione. */
  minPrice: number;
  /** Selezioni al massimo. */
  legs: number;
  /** Quota totale da raggiungere: si aggiungono partite finché non la si tocca. */
  targetPrice?: number;
  /** Senza la quota totale `targetPrice` nessuna schedina (niente ripiego a quote basse). */
  strictTarget?: boolean;
  /**
   * Profilo «di precisione» (ADR 0070): sceglie le giocate più probabili, non le più
   * convenienti, e accetta un valore della schedina fino a `minSlipValue` (leggermente
   * negativo): si vince più spesso, con quote più basse.
   */
  precision?: boolean;
  /** Valore minimo dell'intera schedina; predefinito `MIN_SLIP_VALUE` (zero). */
  minSlipValue?: number;
  /** Valore minimo di ogni giocata; predefinito `MIN_EDGE` per la precisione, zero per il valore. */
  minEdge?: number;
}

/**
 * Profili dal 25/11/2026 (ADR 0072): quota totale **minima** 3, 5 e 10, senza ripiego a
 * quote più basse. Poche partite con quote alte, invece di tante partite «sicure»: ogni
 * partita in più moltiplica anche il margine del bookmaker.
 */
export const BOLLETTA_RULES: Readonly<Record<BuiltProfile, BollettaRule>> = {
  // Le giocate più probabili, ognuna quotata almeno 1,40.
  SOLID: {
    minProbability: 0.6,
    minPrice: 1.4,
    legs: 5,
    targetPrice: 3,
    strictTarget: true,
    precision: true,
    minSlipValue: -0.15,
  },
  // Quote da 1,70, le più convenienti rispetto al mercato.
  BALANCED: {
    minProbability: 0.5,
    minPrice: 1.7,
    legs: 5,
    targetPrice: 5,
    strictTarget: true,
    minEdge: -0.03,
    minSlipValue: -0.15,
  },
  // Quote da 2, le più convenienti: vince di rado, ma paga almeno 10 volte la puntata.
  HIGH: {
    minProbability: 0.38,
    minPrice: 2,
    legs: 5,
    targetPrice: 10,
    strictTarget: true,
    minEdge: -0.03,
    minSlipValue: -0.15,
  },
};

/** Ogni passo abbassa la probabilità minima di 5 punti e la quota minima di 0,1. */
export const RELAX_STEPS = 3;

/** Valore = probabilità × quota − 1. Fuori da questo intervallo la selezione è scartata. */
export const MIN_EDGE = -0.05;
export const MAX_EDGE = 0.15;
/**
 * Peso del mercato nella probabilità delle schedine (ADR 0071, 0073): lo stesso delle proposte
 * con valore. Sui dati veri le quote dei bookmaker senza margine indovinano meglio del
 * modello da solo (Brier 0,2100 contro 0,2178 su 408 giocate; Log Loss 1X2 0,9500 contro
 * 0,9694): 0,75 tiene conto di entrambi.
 */
export { MARKET_WEIGHT };
export const MIN_LEGS = 2;
/** Distanza massima tra modello (corretto) e mercato senza margine, in punti. */
export const MAX_DISAGREEMENT = 0.1;
/**
 * Valore atteso minimo dell'intera schedina (probabilità × quota totale − 1). Zero: non si
 * consiglia una schedina che in media fa perdere, anche se ogni selezione è "sicura".
 */
export const MIN_SLIP_VALUE = 0;

export interface BollettaPick extends LikelyPick {
  /** Probabilità del solo modello; `probability` è quella prudente usata per le scelte. */
  modelProbability: number;
  /** Probabilità del mercato senza margine, se ci sono quote. */
  marketProbability: number | null;
  price: number;
  bookmaker: string;
  /** Quota più alta su un altro bookmaker italiano, se quella mostrata è del sito dell'utente. */
  better?: { price: number; bookmaker: string } | null;
  /** Quando è stata letta la quota. */
  observedAt: string;
  /** probabilità × quota − 1. */
  edge: number;
  /** Versione del modello e momento della previsione usata (ADR 0075). */
  modelVersionId?: number | null;
  predictionAsOf?: string | null;
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
  /** Valore atteso per 1 € puntato: probabilità × quota − 1. */
  expectedValue: number;
  /** Quante volte sono state allargate le soglie del profilo per costruirla (0 = nessuna). */
  relaxStep?: number;
}

const IMPLIED_SELECTIONS: Readonly<Record<string, readonly string[]>> = {
  h2h: ["HOME", "DRAW", "AWAY"],
  double_chance: ["HOME_DRAW", "HOME_AWAY", "DRAW_AWAY"],
};

/**
 * Probabilità di mercato senza margine (ADR 0016, 0033), chiave `partita|mercato|esito`.
 * Per ogni bookmaker si normalizzano le probabilità implicite (1 ÷ quota) del mercato,
 * poi si fa la media tra i bookmaker. La doppia chance viene dal consenso 1X2 quando c'è
 * (somma di due esiti), altrimenti dalle sue quote normalizzate a somma 2.
 */
export function marketConsensus(
  rows: readonly LatestOddsRow[],
  /**
   * Come si toglie il margine di ogni bookmaker (1X2 e under/over). In servizio sempre
   * «proporzionale»; potenza e Shin servono all'analisi (ADR 0078) finché i dati non
   * bastano per scegliere (ADR 0076, regola di stop).
   */
  method: DemarginMethod = "proportional",
): Map<string, number> {
  const books = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const price = Number(r.price);
    if (r.match_id === null || !(price > 1)) continue;
    const key = `${r.match_id}|${r.bookmaker}|${r.market}`;
    const book = books.get(key) ?? new Map<string, number>();
    book.set(r.selection, price);
    books.set(key, book);
  }
  const sums = new Map<string, { total: number; n: number }>();
  for (const [key, book] of books) {
    const [match, , market] = key.split("|");
    const selections =
      IMPLIED_SELECTIONS[market!] ?? (market!.startsWith("totals_") ? ["OVER", "UNDER"] : null);
    if (!selections || !selections.every((x) => book.has(x))) continue;
    const implied = selections.map((x) => 1 / book.get(x)!);
    const target = market === "double_chance" ? 2 : 1;
    const total = implied.reduce((a, b) => a + b, 0);
    const fair = fairShares(
      selections.map((x) => book.get(x)!),
      implied,
      total,
      market === "double_chance" ? "proportional" : method,
    );
    selections.forEach((x, i) => {
      const k = `${match}|${market}|${x}`;
      const cur = sums.get(k) ?? { total: 0, n: 0 };
      cur.total += fair[i]! * target;
      cur.n += 1;
      sums.set(k, cur);
    });
  }
  const out = new Map<string, number>();
  for (const [k, v] of sums) out.set(k, v.total / v.n);
  for (const k of [...out.keys()]) {
    const [match, market] = k.split("|");
    if (market !== "h2h") continue;
    const h = out.get(`${match}|h2h|HOME`);
    const d = out.get(`${match}|h2h|DRAW`);
    const a = out.get(`${match}|h2h|AWAY`);
    if (h === undefined || d === undefined || a === undefined) continue;
    out.set(`${match}|double_chance|HOME_DRAW`, h + d);
    out.set(`${match}|double_chance|HOME_AWAY`, h + a);
    out.set(`${match}|double_chance|DRAW_AWAY`, d + a);
  }
  return out;
}

/** Quote di un bookmaker senza margine; se il metodo non si applica, proporzionale. */
function fairShares(
  odds: readonly number[],
  implied: readonly number[],
  total: number,
  method: DemarginMethod,
): number[] {
  if (method !== "proportional") {
    try {
      return demargin(odds, method);
    } catch {
      // Quote per cui il metodo non converge: si torna al proporzionale.
    }
  }
  return implied.map((x) => x / total);
}

export function consensusFor(
  consensus: ReadonlyMap<string, number>,
  pick: Pick<LikelyPick, "matchId" | "market" | "line" | "selection">,
): number | null {
  const market = oddsMarketFor(pick.market, pick.line);
  return market ? (consensus.get(`${pick.matchId}|${market}|${pick.selection}`) ?? null) : null;
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
  consensus: ReadonlyMap<string, number> = new Map(),
  weight: number = MARKET_WEIGHT,
  calibration: Calibration = new Map(),
): BollettaPick[] {
  const result: BollettaPick[] = [];
  for (const r of rows) {
    const rawProbability = Number(r.probability);
    const confidence = Number(r.confidence_score);
    if (!allowedMarket(r) || confidence < MIN_CONFIDENCE) continue;
    if (!(rawProbability > 0)) continue;
    const modelProbability = calibrate(
      rawProbability,
      r.market,
      r.line === null ? null : Number(r.line),
      calibration,
    );
    const pick: LikelyPick = {
      matchId: Number(r.match_id),
      kickoffAt: r.kickoff_at,
      competitionId: r.competition_id ?? null,
      home: r.home_team_name,
      away: r.away_team_name,
      market: r.market,
      line: r.line === null ? null : Number(r.line),
      selection: r.selection,
      probability: modelProbability,
      confidence,
    };
    const it = italianPriceFor(prices, pick);
    if (!it || !(it.price > 1)) continue;
    const market = consensusFor(consensus, pick);
    if (market !== null && Math.abs(modelProbability - market) > MAX_DISAGREEMENT) continue;
    const probability =
      market === null ? modelProbability : (1 - weight) * modelProbability + weight * market;
    if (probability > MAX_PICK_PROBABILITY) continue;
    const edge = probability * it.price - 1;
    if (edge < MIN_EDGE || edge > MAX_EDGE) continue;
    result.push({
      ...pick,
      probability,
      modelProbability,
      marketProbability: market,
      price: it.price,
      bookmaker: it.bookmaker,
      better: it.better ?? null,
      observedAt: it.observedAt,
      edge,
      modelVersionId: r.model_version_id ?? null,
      predictionAsOf: r.as_of ?? null,
    });
  }
  return result;
}

/** Precisione e valore insieme: probabilità + valore, a parità la probabilità più alta. */
const byValue = (a: BollettaPick, b: BollettaPick) =>
  b.probability + b.edge - (a.probability + a.edge) ||
  b.probability - a.probability ||
  a.kickoffAt.localeCompare(b.kickoffAt) ||
  a.matchId - b.matchId;

/** Prima la probabilità più alta, a parità il valore. */
const byProbability = (a: BollettaPick, b: BollettaPick) =>
  b.probability - a.probability ||
  b.edge - a.edge ||
  a.kickoffAt.localeCompare(b.kickoffAt) ||
  a.matchId - b.matchId;

/**
 * Ricerca esaustiva (ADR 0078), **solo per l'analisi**: tra tutte le combinazioni di giocate
 * ammesse dal profilo (al più una per partita, nessuna squadra due volte, al più `rule.legs`),
 * quella con la probabilità più alta che arriva a `rule.targetPrice` e rispetta il valore
 * minimo della schedina. La costruzione in servizio (`attempt`) prende invece le giocate
 * una alla volta e si ferma alla prima che tocca la quota.
 *
 * Aggiungere una giocata abbassa sempre la probabilità: un ramo si chiude quando tocca la
 * quota o quando scende sotto la migliore trovata. Si guardano le `maxCandidates` giocate
 * più probabili.
 */
export function exhaustiveLegs(
  rule: BollettaRule,
  pool: readonly BollettaPick[],
  maxCandidates = 40,
): BollettaPick[] | null {
  const minSlipValue = rule.minSlipValue ?? MIN_SLIP_VALUE;
  const minEdge = rule.minEdge ?? (rule.precision ? MIN_EDGE : 0);
  const candidates = pool
    .filter(
      (p) => p.probability >= rule.minProbability && p.price >= rule.minPrice && p.edge >= minEdge,
    )
    .sort(byProbability)
    .slice(0, maxCandidates);
  const target = rule.targetPrice ?? 0;
  let best: BollettaPick[] | null = null;
  let bestProbability = 0;
  const chosen: BollettaPick[] = [];
  const visit = (from: number, probability: number, price: number, value: number) => {
    if (probability <= bestProbability) return;
    if (chosen.length >= MIN_LEGS && price >= target) {
      if (value >= minSlipValue) {
        best = [...chosen];
        bestProbability = probability;
      }
      return;
    }
    if (chosen.length >= rule.legs) return;
    for (let i = from; i < candidates.length; i++) {
      const p = candidates[i]!;
      if (
        chosen.some(
          (c) =>
            c.matchId === p.matchId ||
            c.home === p.home ||
            c.home === p.away ||
            c.away === p.home ||
            c.away === p.away,
        )
      )
        continue;
      chosen.push(p);
      visit(i + 1, probability * p.probability, price * p.price, (1 + value) * (1 + p.edge) - 1);
      chosen.pop();
    }
  };
  visit(0, 1, 1, 0);
  return best;
}

/** Una schedina con le soglie date; `null` se non si arriva ad almeno `MIN_LEGS` partite. */
function attempt(
  rule: BollettaRule,
  pool: readonly BollettaPick[],
  minProbability: number,
  minPrice: number,
): BollettaPick[] | null {
  const order = rule.precision ? byProbability : byValue;
  const minSlipValue = rule.minSlipValue ?? MIN_SLIP_VALUE;
  // Precisione: anche un po' sotto la quota giusta; valore: almeno alla quota giusta (ADR 0070).
  const minEdge = rule.minEdge ?? (rule.precision ? MIN_EDGE : 0);
  // Per ogni partita, la giocata migliore per il profilo tra quelle ammesse.
  const perMatch = new Map<number, BollettaPick>();
  for (const p of pool) {
    if (p.probability < minProbability || p.price < minPrice || p.edge < minEdge) continue;
    const current = perMatch.get(p.matchId);
    if (!current || order(p, current) < 0) perMatch.set(p.matchId, p);
  }
  const chosen: BollettaPick[] = [];
  let value = 0;
  let price = 1;
  const teams = new Set<string>();
  for (const p of [...perMatch.values()].sort(order)) {
    if (chosen.length >= rule.legs) break;
    // Quota totale raggiunta (ADR 0071): basta così, meno partite vuol dire più probabilità.
    if (rule.targetPrice && chosen.length >= MIN_LEGS && price >= rule.targetPrice) break;
    if (teams.has(p.home) || teams.has(p.away)) continue;
    // Il valore complessivo non scende sotto la soglia del profilo.
    if ((1 + value) * (1 + p.edge) - 1 < minSlipValue) continue;
    value = (1 + value) * (1 + p.edge) - 1;
    price *= p.price;
    teams.add(p.home).add(p.away);
    chosen.push(p);
  }
  return chosen.length < MIN_LEGS ? null : chosen;
}

function buildOne(
  profile: BuiltProfile,
  round: string,
  pool: readonly BollettaPick[],
  rules: Readonly<Record<BuiltProfile, BollettaRule>> = BOLLETTA_RULES,
): Bolletta | null {
  const rule = rules[profile];
  // Prima con le soglie del profilo, poi un po' più larghe finché la quota totale arriva
  // all'obiettivo (ADR 0071). Se non ci arriva nemmeno così: con `strictTarget` (ADR 0072)
  // nessuna schedina, altrimenti resta quella con le soglie più strette.
  let chosen: BollettaPick[] | null = null;
  let relaxStep = 0;
  for (let step = 0; step <= RELAX_STEPS; step++) {
    const legs = attempt(
      rule,
      pool,
      rule.minProbability - 0.05 * step,
      Math.max(1.05, rule.minPrice - 0.1 * step),
    );
    if (!legs) continue;
    if (!rule.strictTarget && !chosen) {
      chosen = legs;
      relaxStep = step;
    }
    const total = legs.reduce((acc, p) => acc * p.price, 1);
    if (!rule.targetPrice || total >= rule.targetPrice) {
      chosen = legs;
      relaxStep = step;
      break;
    }
  }
  if (!chosen) return null;
  const probability = chosen.reduce((acc, p) => acc * p.probability, 1);
  const price = chosen.reduce((acc, p) => acc * p.price, 1);
  return {
    profile,
    round,
    picks: chosen.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.matchId - b.matchId),
    oddsObservedAt: chosen.map((p) => p.observedAt).sort()[0] ?? "",
    probability,
    price,
    expectedValue: probability * price - 1,
    relaxStep,
  };
}

const signature = (b: Bolletta) =>
  b.picks.map((p) => `${p.matchId}|${p.market}|${p.line}|${p.selection}`).join(";");

/**
 * Periodo di una schedina (ADR 0070): il turno (venerdì–lunedì o martedì–giovedì) oppure
 * una giornata sola.
 */
export const SLIP_WINDOWS = ["round", "day"] as const;
export type SlipWindow = (typeof SLIP_WINDOWS)[number];

export function isSlipWindow(value: unknown): value is SlipWindow {
  return (SLIP_WINDOWS as readonly unknown[]).includes(value);
}

/** Data di Roma (`AAAA-MM-GG`) del calcio d'inizio. */
export function romeDayOf(kickoffAt: string): string {
  return ROME_DAY.format(new Date(kickoffAt));
}

/** Inizio del periodo a cui appartiene la partita: il turno oppure il giorno. */
export function windowOf(kickoffAt: string, window: SlipWindow): string {
  return window === "round" ? roundOfKickoff(kickoffAt) : romeDayOf(kickoffAt);
}

/**
 * Periodo da mostrare (scelta del proprietario del 27/11/2026): solo il turno in corso, o
 * solo la giornata di oggi. I turni più lontani non si propongono: quote e previsioni
 * cambiano prima che si giochino. Il salvataggio per le Passate (`record.ts`) non cambia.
 */
export function currentWindowStart(window: SlipWindow, now: Date): string {
  return windowOf(now.toISOString(), window);
}

/** La partita (o la data `AAAA-MM-GG`) cade nel periodo da mostrare? */
export function inCurrentWindow(kickoffOrDate: string, window: SlipWindow, now: Date): boolean {
  const at = kickoffOrDate.length === 10 ? `${kickoffOrDate}T12:00:00Z` : kickoffOrDate;
  return windowOf(at, window) === currentWindowStart(window, now);
}

export interface BuildOptions {
  /** Periodo delle schedine: turno (predefinito) o giornata. */
  window?: SlipWindow;
  /** Regole dei profili (per l'analisi delle alternative). */
  rules?: Readonly<Record<BuiltProfile, BollettaRule>>;
  /** Peso del mercato nella probabilità (per l'analisi); predefinito `MARKET_WEIGHT`. */
  marketWeight?: number;
}

/** Bollette per periodo (dal più vicino) e profilo; senza doppioni nello stesso periodo. */
export function buildBollette(
  rows: readonly LikelyRow[],
  prices: ReadonlyMap<string, ItalianPrice>,
  consensus: ReadonlyMap<string, number> = new Map(),
  calibration: Calibration = new Map(),
  options: BuildOptions = {},
): Bolletta[] {
  const window = options.window ?? "round";
  const byRound = new Map<string, BollettaPick[]>();
  const weight = options.marketWeight ?? MARKET_WEIGHT;
  for (const p of playablePicks(rows, prices, consensus, weight, calibration)) {
    const round = windowOf(p.kickoffAt, window);
    byRound.set(round, [...(byRound.get(round) ?? []), p]);
  }
  const result: Bolletta[] = [];
  for (const round of [...byRound.keys()].sort()) {
    const seen = new Set<string>();
    for (const profile of BOLLETTA_PROFILES) {
      const bolletta = buildOne(profile, round, byRound.get(round) ?? [], options.rules);
      if (!bolletta || seen.has(signature(bolletta))) continue;
      seen.add(signature(bolletta));
      result.push(bolletta);
    }
  }
  return result;
}

/**
 * Oltre questa età la quota va ricontrollata dal bookmaker: 26 ore, come la freschezza delle
 * quote (le quote si raccolgono una volta al giorno, ADR 0071).
 */
export const ODDS_MAX_AGE_MS = 26 * 3_600_000;

/**
 * Versione delle regole delle schedine consigliate, salvata con ogni schedina (ADR 0075).
 * Va cambiata a ogni modifica di profili, soglie, peso del mercato o filtri delle quote.
 */
export const SLIP_RULES_VERSION = "2026.11.26-1";

/** Regole con cui è stata costruita una schedina di un profilo, da salvare con lei. */
export function slipRulesSnapshot(profile: BollettaProfile) {
  return {
    version: SLIP_RULES_VERSION,
    profile: profile === "DOUBLE" ? null : BOLLETTA_RULES[profile],
    marketWeight: MARKET_WEIGHT,
    relaxSteps: RELAX_STEPS,
    minEdge: MIN_EDGE,
    maxEdge: MAX_EDGE,
    maxDisagreement: MAX_DISAGREEMENT,
    oddsMaxAgeHours: ODDS_MAX_AGE_MS / 3_600_000,
    kickoffMarginMinutes: KICKOFF_MARGIN_MS / 60_000,
  };
}

/** Come il motore (`KICKOFF_MARGIN`): una partita che inizia tra meno di 15 minuti non si propone. */
export const KICKOFF_MARGIN_MS = 15 * 60_000;

/**
 * Solo le quote lette nelle ultime 26 ore, come le quote FRESH del motore e del Costruisci
 * (ADR 0028, 0071). Una quota più vecchia può essere ferma da giorni: entrerebbe nel consenso
 * del mercato e, se è la più alta, diventerebbe la quota proposta, gonfiando il valore.
 */
export function freshOdds<T extends { observed_at: string }>(rows: readonly T[], now: Date): T[] {
  const oldest = now.getTime() - ODDS_MAX_AGE_MS;
  return rows.filter((r) => {
    const observed = Date.parse(r.observed_at);
    return Number.isFinite(observed) && observed >= oldest;
  });
}

/** Solo le partite che iniziano almeno 15 minuti dopo `now`. */
export function notStartingSoon<T extends { kickoff_at: string }>(
  rows: readonly T[],
  now: Date,
): T[] {
  const first = now.getTime() + KICKOFF_MARGIN_MS;
  return rows.filter((r) => Date.parse(r.kickoff_at) >= first);
}

/**
 * Il valore si mostra solo se è positivo anche dopo l'arrotondamento a un decimale (ADR 0072):
 * così non compare mai «+0,0%».
 */
export function hasPositiveValue(bolletta: Pick<Bolletta, "expectedValue">): boolean {
  return Math.round(bolletta.expectedValue * 1000) > 0;
}

export function oddsAreOld(bolletta: Pick<Bolletta, "oddsObservedAt">, now: Date): boolean {
  const observed = new Date(bolletta.oddsObservedAt).getTime();
  return !Number.isFinite(observed) || now.getTime() - observed > ODDS_MAX_AGE_MS;
}
