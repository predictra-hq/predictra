import {
  COMMENT_MAX_LENGTH,
  isNameColor,
  isNameStyle,
  type NameColor,
  type NameStyle,
} from "@predictra/shared-types";

/**
 * Comunità (ADR 0058, 0064): stile del nome e testo dei messaggi.
 * Le stesse regole sono nel database (`20261117190000_community.sql`): qui servono per
 * mostrare l'interfaccia giusta e messaggi chiari prima di scrivere.
 */

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
  mono: "name-mono",
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
