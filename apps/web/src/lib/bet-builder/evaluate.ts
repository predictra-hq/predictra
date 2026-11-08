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

/** Selezione codificata nei form: `<match_id>:<HOME|DRAW|AWAY>`. */
export function parseSelectionKey(raw: unknown): { matchId: number; selection: string } | null {
  if (typeof raw !== "string") return null;
  const m = /^([1-9][0-9]{0,15}):(HOME|DRAW|AWAY)$/.exec(raw);
  if (!m) return null;
  const matchId = Number(m[1]);
  return Number.isSafeInteger(matchId) ? { matchId, selection: m[2]! } : null;
}

/** Chiavi uniche, valide e al massimo `MAX_MANUAL_SELECTIONS`. */
export function parseSelectionKeys(values: unknown): { matchId: number; selection: string }[] {
  const list = Array.isArray(values) ? values : values === undefined ? [] : [values];
  const seen = new Set<string>();
  const out: { matchId: number; selection: string }[] = [];
  for (const raw of list) {
    const parsed = parseSelectionKey(raw);
    if (!parsed) continue;
    const key = `${parsed.matchId}:${parsed.selection}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
    if (out.length === MAX_MANUAL_SELECTIONS) break;
  }
  return out;
}
