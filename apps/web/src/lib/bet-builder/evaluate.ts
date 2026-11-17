import {
  DEFAULT_BET_BUILDER_RULES,
  categoryForProbability,
  expectedValue,
  independentProbability,
  type BetBuilderRules,
  type BetProposalCategory,
  type FreshnessStatus,
} from "@predictra/shared-types";

/*
 * Valutazione di una combinazione costruita a mano (M5 corsia B, fase B3).
 * Logica pura, nessun accesso al database. Stesse regole del motore
 * (ADR 0025–0027): probabilità del modello attivo, quote reali FRESH,
 * indipendenza solo tra partite e squadre diverse. In v1 più selezioni sulla
 * stessa partita non sono modellabili (ADR 0026 §1): la combinazione è esclusa.
 */

export const MAX_MANUAL_SELECTIONS = 10;

export interface ManualSelection {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  /** Mercato della giocata (predefinito 1X2) e linea per i gol totali. */
  market?: string;
  line?: number | null;
  selection: string;
  /** Probabilità del modello attivo; `null` se manca la previsione. */
  probability: number | null;
  confidence: number | null;
  /** Migliore quota reale disponibile; `null` se non c'è. */
  price: number | null;
  freshness: FreshnessStatus | null;
}

export const EVALUATION_WARNINGS = [
  "TOO_MANY",
  "SAME_MATCH",
  "SAME_TEAM",
  "STARTED",
  "NO_PREDICTION",
  "NO_ODDS",
  "STALE_ODDS",
  "LOW_CONFIDENCE",
  "NEGATIVE_EV",
  "BELOW_THRESHOLDS",
] as const;
export type EvaluationWarning = (typeof EVALUATION_WARNINGS)[number];

export interface Evaluation {
  legs: number;
  /** Falso se la combinazione non è modellabile: nessun numero va mostrato. */
  modellable: boolean;
  probability: number | null;
  price: number | null;
  expectedValue: number | null;
  confidence: number | null;
  category: BetProposalCategory | null;
  /** Vero se rispetta tutte le regole con cui il motore propone combinazioni. */
  meetsRules: boolean;
  warnings: EvaluationWarning[];
}

export function evaluateSelections(
  selections: readonly ManualSelection[],
  now: Date,
  rules: BetBuilderRules = DEFAULT_BET_BUILDER_RULES,
): Evaluation {
  const warnings = new Set<EvaluationWarning>();
  const legs = selections.length;
  if (legs > rules.max_legs) warnings.add("TOO_MANY");

  const matches = new Set(selections.map((s) => s.matchId));
  if (matches.size < legs) warnings.add("SAME_MATCH");
  const teams = selections.flatMap((s) => [s.homeTeam, s.awayTeam]);
  if (new Set(teams).size < teams.length && !warnings.has("SAME_MATCH")) warnings.add("SAME_TEAM");
  if (selections.some((s) => new Date(s.kickoffAt).getTime() <= now.getTime())) {
    warnings.add("STARTED");
  }
  if (selections.some((s) => s.probability === null)) warnings.add("NO_PREDICTION");
  if (selections.some((s) => s.price === null)) warnings.add("NO_ODDS");
  if (selections.some((s) => s.price !== null && s.freshness !== "FRESH")) {
    warnings.add("STALE_ODDS");
  }

  const modellable =
    legs > 0 && !warnings.has("SAME_MATCH") && !warnings.has("SAME_TEAM") && legs <= 10;
  const probabilities = selections.map((s) => s.probability);
  const probability =
    modellable && probabilities.every((p): p is number => p !== null)
      ? independentProbability(probabilities)
      : null;
  const prices = selections.map((s) => s.price);
  const price =
    modellable && prices.every((p): p is number => p !== null)
      ? prices.reduce((acc, p) => acc * p, 1)
      : null;
  const ev = probability !== null && price !== null ? expectedValue(probability, price) : null;
  const confidences = selections.map((s) => s.confidence);
  const confidence =
    modellable && confidences.every((c): c is number => c !== null)
      ? Math.min(...confidences)
      : null;

  if (confidence !== null && confidence < rules.min_confidence_score)
    warnings.add("LOW_CONFIDENCE");
  if (ev !== null && ev < 0) warnings.add("NEGATIVE_EV");

  const legsOk = selections.every(
    (s) =>
      s.probability !== null &&
      s.price !== null &&
      s.confidence !== null &&
      s.probability >= rules.min_leg_probability &&
      s.confidence >= rules.min_confidence_score &&
      expectedValue(s.probability, s.price) >= rules.min_leg_expected_value,
  );
  const meetsRules =
    modellable &&
    probability !== null &&
    ev !== null &&
    legsOk &&
    !warnings.has("TOO_MANY") &&
    !warnings.has("STARTED") &&
    !warnings.has("STALE_ODDS") &&
    probability >= rules.min_probability &&
    ev >= rules.min_expected_value;
  if (modellable && probability !== null && ev !== null && !meetsRules) {
    warnings.add("BELOW_THRESHOLDS");
  }

  return {
    legs,
    modellable,
    probability,
    price,
    expectedValue: ev,
    confidence,
    category: probability !== null ? categoryForProbability(probability) : null,
    meetsRules,
    warnings: EVALUATION_WARNINGS.filter((w) => warnings.has(w)),
  };
}

/** Giocate sceglibili in Costruisci: mercato → linee ammesse ed esiti. */
export const BUILDER_MARKETS: Readonly<
  Record<string, { lines: readonly (number | null)[]; selections: readonly string[] }>
> = {
  "1X2": { lines: [null], selections: ["HOME", "DRAW", "AWAY"] },
  DOUBLE_CHANCE: { lines: [null], selections: ["HOME_DRAW", "HOME_AWAY", "DRAW_AWAY"] },
  TOTAL_GOALS: { lines: [1.5, 2.5, 3.5], selections: ["OVER", "UNDER"] },
  BTTS: { lines: [null], selections: ["YES", "NO"] },
};

export interface SelectionKey {
  matchId: number;
  market: string;
  line: number | null;
  selection: string;
}

/** Chiave di una giocata nei form e nell'indirizzo: `<partita>:<mercato>:<linea>:<esito>`. */
export function selectionKey(k: SelectionKey): string {
  return `${k.matchId}:${k.market}:${k.line ?? ""}:${k.selection}`;
}

/**
 * Selezione codificata: `<partita>:<mercato>:<linea>:<esito>` (es. `12:TOTAL_GOALS:2.5:OVER`)
 * oppure, come nelle schedine salvate prima, `<partita>:<HOME|DRAW|AWAY>` per l'1X2.
 */
export function parseSelectionKey(raw: unknown): SelectionKey | null {
  if (typeof raw !== "string") return null;
  const short = /^([1-9][0-9]{0,15}):(HOME|DRAW|AWAY)$/.exec(raw);
  const full = /^([1-9][0-9]{0,15}):([A-Z0-9_]{2,20}):([0-9.]{0,4}):([A-Z_]{2,12})$/.exec(raw);
  const matchId = Number((short ?? full)?.[1]);
  if (!Number.isSafeInteger(matchId) || matchId <= 0) return null;
  if (short) return { matchId, market: "1X2", line: null, selection: short[2]! };
  if (!full) return null;
  const market = full[2]!;
  const line = full[3] === "" ? null : Number(full[3]);
  const spec = BUILDER_MARKETS[market];
  if (!spec || !spec.lines.includes(line) || !spec.selections.includes(full[4]!)) return null;
  return { matchId, market, line, selection: full[4]! };
}

/** Chiavi valide, una sola giocata per partita (la prima), al massimo `MAX_MANUAL_SELECTIONS`. */
export function parseSelectionKeys(values: unknown): SelectionKey[] {
  const list = Array.isArray(values) ? values : values === undefined ? [] : [values];
  const seen = new Set<number>();
  const out: SelectionKey[] = [];
  for (const raw of list) {
    const parsed = parseSelectionKey(raw);
    if (!parsed || seen.has(parsed.matchId)) continue;
    seen.add(parsed.matchId);
    out.push(parsed);
    if (out.length === MAX_MANUAL_SELECTIONS) break;
  }
  return out;
}
