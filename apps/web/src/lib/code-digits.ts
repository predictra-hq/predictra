/** Cifre del codice 2FA: sempre 6, come nelle app di autenticazione (TOTP). */
export const CODE_LENGTH = 6;

/** Solo le cifre di un testo incollato o scritto (es. "123 456" o "Codice: 123456"). */
export function digitsOf(text: string): string {
  return text.replace(/\D/g, "");
}

/** Un codice a 6 cifre dentro un testo copiato, se c'è (il primo gruppo di 6 cifre). */
export function codeFromText(text: string): string | null {
  const grouped = /(?<!\d)(\d{3})[\s-]?(\d{3})(?!\d)/.exec(text);
  if (grouped) return grouped[1]! + grouped[2]!;
  const digits = digitsOf(text);
  return digits.length === CODE_LENGTH ? digits : null;
}

/**
 * Inserisce le cifre scritte a partire dalla casella `index`: una cifra resta nella sua
 * casella, più cifre insieme (incolla, riempimento automatico) proseguono nelle successive.
 */
export function fillDigits(current: readonly string[], index: number, typed: string): string[] {
  const next = [...current];
  const digits = digitsOf(typed);
  if (!digits) {
    next[index] = "";
    return next;
  }
  const start = digits.length >= CODE_LENGTH ? 0 : index;
  for (let i = 0; i < digits.length && start + i < CODE_LENGTH; i++) {
    next[start + i] = digits[i]!;
  }
  return next;
}
