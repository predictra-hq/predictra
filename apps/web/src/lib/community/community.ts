import {
  ADULT_AGE,
  COMMENT_MAX_LENGTH,
  isNameColor,
  isNameStyle,
  type NameColor,
  type NameStyle,
} from "@predictra/shared-types";

/**
 * Comunità (ADR 0058): maggiore età dichiarata, stile del nome, testo dei commenti.
 * Le stesse regole sono nel database (`20261117170000_community.sql`): qui servono per
 * mostrare l'interfaccia giusta e messaggi chiari prima di scrivere.
 */

/** Età compiuta alla data `today` (entrambe `AAAA-MM-GG`). */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

/** Maggiorenne dichiarato: almeno 18 anni compiuti oggi. Senza data, no. */
export function isAdult(birthDate: string | null | undefined, today: string): boolean {
  return Boolean(birthDate) && ageOn(birthDate!, today) >= ADULT_AGE;
}

/** Data di nascita dal modulo: valida, non nel futuro, non prima del 1900. */
export function parseBirthDate(raw: unknown, today: string): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return null;
  if (raw < "1900-01-01" || raw > today) return null;
  return raw;
}

/** Testo del commento: spazi ai bordi tolti; vuoto o troppo lungo non vale. */
export function parseCommentBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  return body.length >= 1 && body.length <= COMMENT_MAX_LENGTH ? body : null;
}

/** Stile scelto nel modulo: valore dell'elenco oppure nessuno («default»). */
export function parseNameStyle(
  color: unknown,
  style: unknown,
): { name_color: NameColor | null; name_style: NameStyle | null } {
  return {
    name_color: isNameColor(color) ? color : null,
    name_style: isNameStyle(style) ? style : null,
  };
}

/** Classi del nome: colore da `globals.css` (leggibile in entrambi i temi) e scritta. */
export function nameClasses(color: string | null, style: string | null): string {
  const classes: string[] = [];
  if (isNameColor(color)) classes.push(NAME_COLOR_CLASS[color]);
  if (isNameStyle(style)) classes.push(NAME_STYLE_CLASS[style]);
  return classes.join(" ");
}

const NAME_COLOR_CLASS: Readonly<Record<NameColor, string>> = {
  green: "text-name-green",
  teal: "text-name-teal",
  blue: "text-name-blue",
  violet: "text-name-violet",
  pink: "text-name-pink",
  orange: "text-name-orange",
  amber: "text-name-amber",
  red: "text-name-red",
};

const NAME_STYLE_CLASS: Readonly<Record<NameStyle, string>> = {
  bold: "font-bold",
  italic: "italic",
  mono: "font-mono",
  caps: "uppercase tracking-wider",
};

/** Data di oggi nel fuso di Roma, `AAAA-MM-GG`: la stessa del database per i compleanni. */
export function todayInRome(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
