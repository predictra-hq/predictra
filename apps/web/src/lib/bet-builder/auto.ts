import {
  categoryForProbability,
  independentProbability,
  type BetProposalCategory,
} from "@predictra/shared-types";
import { selectionKey, type ManualSelection } from "./evaluate";
import {
  MAX_PICK_PROBABILITY,
  MIN_CONFIDENCE,
  MIN_PICK_PROBABILITY,
  MULTIPLE_MIN_PROBABILITY,
} from "./likely";

/*
 * «Costruiscila per me» e analisi della schedina in Costruisci (ADR 0081).
 *
 * Logica pura, nessun accesso al database. Solo probabilità del modello attivo e quote
 * reali già raccolte: nessun numero viene inventato o stimato da un LLM. Con
 * l'indipendenza tra partite diverse (ADR 0026 §2) la multipla di k partite più
 * probabile è fatta dei k pronostici più probabili, uno per partita.
 */

/** Partite di una schedina costruita in automatico, se non se ne sceglie il numero. */
export const AUTO_MIN_LEGS = 2;
export const AUTO_MAX_LEGS = 6;
/** Numeri di partite che si possono chiedere. */
export const AUTO_LEG_CHOICES = [2, 3, 4, 5, 6] as const;

export type Selection = ManualSelection & { market: string; line: number | null };

export interface OptionLike {
  matchId: number;
  kickoffAt: string;
  outcomes: readonly Selection[];
}

/** Vero se la giocata può entrare in una schedina automatica. */
function eligible(
  s: Selection,
  now: Date,
): s is Selection & { probability: number; price: number } {
  return (
    s.probability !== null &&
    s.price !== null &&
    s.confidence !== null &&
    s.confidence >= MIN_CONFIDENCE &&
    s.probability >= MIN_PICK_PROBABILITY &&
    s.probability <= MAX_PICK_PROBABILITY &&
    new Date(s.kickoffAt).getTime() > now.getTime()
  );
}

/** La giocata più probabile di una partita tra quelle ammesse (a pari probabilità, la quota più alta). */
export function safestOf(outcomes: readonly Selection[], now: Date): Selection | null {
  let best: (Selection & { probability: number; price: number }) | null = null;
  for (const s of outcomes) {
    if (!eligible(s, now)) continue;
    if (
      !best ||
      s.probability > best.probability ||
      (s.probability === best.probability && s.price > best.price)
    ) {
      best = s;
    }
  }
  return best;
}

export interface AutoResult {
  selections: Selection[];
  probability: number | null;
  /** Livello che la schedina raggiunge davvero (con un numero di partite fisso può scendere). */
  reached: BetProposalCategory | null;
}

/**
 * Schedina costruita dai dati: per ogni partita la giocata più probabile (con quota reale e
 * Confidence Score sufficiente), partite ordinate dalla più sicura, mai due volte la
 * stessa squadra. Con `legs` si prendono quelle partite; senza, la più lunga (da 2 a 6)
 * che resta sopra la soglia del livello scelto.
 */
export function autoBuild(
  options: readonly OptionLike[],
  level: BetProposalCategory,
  legs: number | null,
  now: Date,
): AutoResult {
  const candidates = options
    .map((o) => safestOf(o.outcomes, now))
    .filter((s): s is Selection => s !== null)
    .sort(
      (a, b) =>
        b.probability! - a.probability! ||
        a.kickoffAt.localeCompare(b.kickoffAt) ||
        a.matchId - b.matchId,
    );

  const picked: Selection[] = [];
  const teams = new Set<string>();
  const limit = legs ?? AUTO_MAX_LEGS;
  const min = MULTIPLE_MIN_PROBABILITY[level];
  for (const s of candidates) {
    if (picked.length >= limit) break;
    if (teams.has(s.homeTeam) || teams.has(s.awayTeam)) continue;
    if (legs === null && picked.length >= AUTO_MIN_LEGS) {
      const next = independentProbability([...picked, s].map((x) => x.probability!));
      if (next < min) break;
    }
    picked.push(s);
    teams.add(s.homeTeam);
    teams.add(s.awayTeam);
  }

  const probability =
    picked.length > 0 ? independentProbability(picked.map((x) => x.probability!)) : null;
  return {
    selections: picked,
    probability,
    reached: probability === null ? null : categoryForProbability(probability),
  };
}

export interface WhatIf {
  kind: "remove" | "swap";
  /** Giocata da togliere o da sostituire. */
  from: Selection;
  /** Giocata al posto di `from` (solo per `swap`). */
  to: Selection | null;
  /** Chiavi della schedina dopo la modifica, per applicarla con un tocco. */
  keys: string[];
  probability: number;
  price: number | null;
}

export interface SlipAnalysis {
  probability: number;
  price: number | null;
  category: BetProposalCategory;
  /** Su 100 schedine così, quante passano secondo il modello (arrotondato). */
  outOf100: number;
  /** La giocata meno probabile: quella che più facilmente fa perdere la schedina. */
  weakest: Selection;
  /** Le modifiche che alzano di più la probabilità, dalla più utile (al massimo 3). */
  whatIfs: WhatIf[];
}

function totals(list: readonly Selection[]): { probability: number | null; price: number | null } {
  const ps = list.map((s) => s.probability);
  const qs = list.map((s) => s.price);
  return {
    probability: ps.every((p): p is number => p !== null) ? independentProbability(ps) : null,
    price: qs.every((q): q is number => q !== null) ? qs.reduce((a, q) => a * q, 1) : null,
  };
}

/**
 * Analisi di una schedina già scelta: quanto è sicura, la giocata più debole e cosa
 * cambierebbe togliendo una giocata o sostituendola con la più probabile della stessa
 * partita. `null` se manca una probabilità o c'è meno di una giocata.
 */
export function analyzeSlip(
  selected: readonly Selection[],
  options: readonly OptionLike[],
  now: Date,
): SlipAnalysis | null {
  const base = totals(selected);
  if (selected.length === 0 || base.probability === null) return null;
  const weakest = selected.reduce((w, s) => (s.probability! < w.probability! ? s : w));

  const whatIfs: WhatIf[] = [];
  if (selected.length > 1) {
    for (const s of selected) {
      const rest = selected.filter((x) => x !== s);
      const t = totals(rest);
      if (t.probability === null) continue;
      whatIfs.push({
        kind: "remove",
        from: s,
        to: null,
        keys: rest.map(selectionKey),
        probability: t.probability,
        price: t.price,
      });
    }
  }
  for (const s of selected) {
    const option = options.find((o) => o.matchId === s.matchId);
    const safer = option ? safestOf(option.outcomes, now) : null;
    if (!safer || selectionKey(safer) === selectionKey(s)) continue;
    if (safer.probability! <= s.probability!) continue;
    const swapped = selected.map((x) => (x === s ? safer : x));
    const t = totals(swapped);
    if (t.probability === null) continue;
    whatIfs.push({
      kind: "swap",
      from: s,
      to: safer,
      keys: swapped.map(selectionKey),
      probability: t.probability,
      price: t.price,
    });
  }
  whatIfs.sort((a, b) => b.probability - a.probability || (b.price ?? 0) - (a.price ?? 0));

  return {
    probability: base.probability,
    price: base.price,
    category: categoryForProbability(base.probability),
    outOf100: Math.round(base.probability * 100),
    weakest,
    whatIfs: whatIfs.slice(0, 3),
  };
}

/** Livello richiesto nell'indirizzo (`?auto=`), se valido. */
export function parseAutoLevel(raw: unknown): BetProposalCategory | null {
  return raw === "CONSERVATIVE" || raw === "BALANCED" || raw === "AGGRESSIVE" ? raw : null;
}

/** Numero di partite richiesto (`?legs=`): uno di `AUTO_LEG_CHOICES`, altrimenti automatico. */
export function parseAutoLegs(raw: unknown): number | null {
  const n = Number(raw);
  return (AUTO_LEG_CHOICES as readonly number[]).includes(n) ? n : null;
}
