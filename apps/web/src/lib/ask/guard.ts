/**
 * Controllo "niente numeri inventati" di Ask PREDICTRA (ADR 0042 §2).
 *
 * Ogni numero della risposta dell'LLM deve comparire nei dati restituiti dagli
 * strumenti (o nella domanda dell'utente). Un numero può essere arrotondato a
 * meno decimali (45,2 → 45), mai cambiato. Funzioni pure, testate in guard.test.ts.
 */

export interface NumberToken {
  /** Testo come appare nella risposta, es. "45,2". */
  raw: string;
  value: number;
  decimals: number;
}

// Numeri con decimali a virgola o punto; esclude le cifre dentro parole come "1X2" o "M8".
const NUMBER = /(?<![\p{L}\d])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu;
// Migliaia con il punto ("1.200") non servono: i dati non ne hanno.

export function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const raw = match[0];
    const normalized = raw.replace(",", ".");
    const decimals = normalized.includes(".") ? normalized.split(".")[1]!.length : 0;
    out.push({ raw, value: Number(normalized), decimals });
  }
  return out;
}

/** Il numero della risposta è uno di quelli consentiti, eventualmente arrotondato? */
function matches(token: NumberToken, allowed: readonly NumberToken[]): boolean {
  return allowed.some((a) => {
    if (token.decimals > a.decimals) return false;
    const factor = 10 ** token.decimals;
    return Math.round(a.value * factor) === Math.round(token.value * factor);
  });
}

export interface GuardResult {
  ok: boolean;
  /** Numeri della risposta che non compaiono nei dati. */
  unknown: string[];
}

/**
 * @param answer risposta dell'LLM
 * @param sources testi da cui i numeri sono ammessi: risultati degli strumenti e domanda
 */
export function checkNumbers(answer: string, sources: readonly string[]): GuardResult {
  const allowed = sources.flatMap(extractNumbers);
  const unknown = extractNumbers(answer)
    .filter((t) => !matches(t, allowed))
    .map((t) => t.raw);
  return { ok: unknown.length === 0, unknown: [...new Set(unknown)] };
}
