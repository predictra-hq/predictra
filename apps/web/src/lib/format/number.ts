/*
 * Formattazione dei numeri in tutta l'app, in italiano (virgola decimale, punto delle migliaia).
 * Un solo modulo: prima c'erano due `formatPercent` diversi (uno con `toFixed`, senza separatore
 * delle migliaia) e quote, Brier ed euro scritti a mano in sei pagine. Un valore assente è
 * sempre «—».
 */

const LOCALE = "it-IT";
export const MISSING = "—";

const finite = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const fixed = (digits: number) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Numero con cifre decimali fisse: 1.4567 → "1,46"; 0.21003 con 3 cifre → "0,210". */
export function formatDecimal(value: number | string | null | undefined, digits = 2): string {
  const n = finite(value);
  return n === null ? MISSING : fixed(digits).format(n);
}

/** Quota decimale con due cifre: 2 → "2,00"; 12345.6 → "12.345,60" (punto delle migliaia da 5 cifre). */
export function formatOdds(price: number | string | null | undefined): string {
  return formatDecimal(price, 2);
}

/** Quota equa 1/p con due decimali; «—» se la probabilità non è positiva. */
export function formatFairOdds(probability: number | string | null | undefined): string {
  const p = finite(probability);
  return p === null || p <= 0 ? MISSING : formatDecimal(1 / p, 2);
}

/** Frazione come percentuale: 0.0441 → "4,4%". */
export function formatPercent(value: number | string | null | undefined, digits = 1): string {
  const n = finite(value);
  if (n === null) return MISSING;
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Percentuale con segno sempre visibile: 0.042 → "+4,2%"; −0.015 → "−1,5%". */
export function formatSignedPercent(value: number | string | null | undefined, digits = 1): string {
  const n = finite(value);
  if (n === null) return MISSING;
  const text = formatPercent(Math.abs(n), digits);
  return n >= 0 ? `+${text}` : `−${text}`;
}

const euro = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" });

/** Importo in euro: 12345.5 → "12.345,50 €". */
export function formatEuro(value: number | string | null | undefined): string {
  const n = finite(value);
  return n === null ? MISSING : euro.format(n);
}
