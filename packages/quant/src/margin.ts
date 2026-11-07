/**
 * Margine e probabilità implicite delle quote decimali (ADR 0016).
 *
 * - probabilità grezza qᵢ = 1 / oᵢ
 * - overround = Σ qᵢ − 1
 * - metodo proporzionale (predefinito): pᵢ = qᵢ / Σ qⱼ
 * - metodo della potenza: pᵢ = qᵢᵏ con k tale che Σ qᵢᵏ = 1 (bisezione)
 * - quota equa: 1 / pᵢ
 *
 * Le probabilità qui sono "implicite nelle quote", non previsioni di PREDICTRA:
 * le previsioni vengono solo dai modelli (regola 5 di CLAUDE.md).
 */

export type DemarginMethod = "proportional" | "power";

export class InvalidOddsError extends Error {}

/** Una quota decimale valida è un numero finito maggiore di 1. */
export function isValidDecimalOdds(odds: number): boolean {
  return Number.isFinite(odds) && odds > 1;
}

function assertMarket(odds: readonly number[]): void {
  if (odds.length < 2) throw new InvalidOddsError("Servono almeno due esiti");
  for (const o of odds) {
    if (!isValidDecimalOdds(o)) throw new InvalidOddsError(`Quota non valida: ${o}`);
  }
}

export function impliedProbabilities(odds: readonly number[]): number[] {
  assertMarket(odds);
  return odds.map((o) => 1 / o);
}

/** Margine del bookmaker: 0.0441 = 4,41%. Può essere negativo (arbitraggio). */
export function overround(odds: readonly number[]): number {
  return impliedProbabilities(odds).reduce((a, b) => a + b, 0) - 1;
}

export function proportionalProbabilities(odds: readonly number[]): number[] {
  const q = impliedProbabilities(odds);
  const sum = q.reduce((a, b) => a + b, 0);
  return q.map((x) => x / sum);
}

/**
 * Metodo della potenza. Con margine positivo k > 1 e il margine pesa di più
 * sugli esiti meno probabili (favourite–longshot bias).
 */
export function powerProbabilities(odds: readonly number[], tolerance = 1e-12): number[] {
  const q = impliedProbabilities(odds);
  const total = (k: number) => q.reduce((acc, x) => acc + x ** k, 0);
  // Σ qᵢᵏ è decrescente in k (ogni qᵢ < 1): si cerca la radice di total(k) = 1.
  let lo = 0.01;
  let hi = 100;
  if (total(lo) < 1 || total(hi) > 1) {
    throw new InvalidOddsError("Metodo della potenza non applicabile a queste quote");
  }
  for (let i = 0; i < 200 && hi - lo > tolerance; i++) {
    const mid = (lo + hi) / 2;
    if (total(mid) > 1) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  const p = q.map((x) => x ** k);
  const sum = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / sum);
}

export function demargin(odds: readonly number[], method: DemarginMethod = "proportional"): number[] {
  return method === "power" ? powerProbabilities(odds) : proportionalProbabilities(odds);
}

/** Quota equa corrispondente a una probabilità (0 < p ≤ 1). */
export function fairOdds(probability: number): number {
  if (!(probability > 0 && probability <= 1)) {
    throw new InvalidOddsError(`Probabilità non valida: ${probability}`);
  }
  return 1 / probability;
}

/**
 * Valore atteso per unità puntata: p · o − 1. La probabilità `p` deve venire da
 * un modello (M4), non dalle quote stesse.
 */
export function expectedValue(probability: number, odds: number): number {
  if (!(probability >= 0 && probability <= 1)) {
    throw new InvalidOddsError(`Probabilità non valida: ${probability}`);
  }
  if (!isValidDecimalOdds(odds)) throw new InvalidOddsError(`Quota non valida: ${odds}`);
  return probability * odds - 1;
}
