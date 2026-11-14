import { cache } from "react";
import { it, type Messages } from "./it";

export const LOCALES = ["it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "it";
export const DEFAULT_TIME_ZONE = "Europe/Rome";

const dictionaries: Record<Locale, Messages> = { it };

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return dictionaries[locale];
}

/*
 * Fuso orario della richiesta in corso. `cache` di React lo tiene separato per ogni
 * richiesta del server: lo imposta il Data Access Layer con la preferenza dell'utente
 * (Impostazioni → Preferenze) prima che la pagina formatti le date. Fuori da una
 * richiesta (test, componenti client) vale il fuso predefinito.
 */
const requestTimeZone = cache((): { current: string } => ({ current: DEFAULT_TIME_ZONE }));

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Imposta il fuso orario della richiesta; un valore non valido lascia quello predefinito. */
export function setRequestTimeZone(value: unknown): void {
  if (isValidTimeZone(value)) requestTimeZone().current = value;
}

export function getRequestTimeZone(): string {
  return requestTimeZone().current;
}

export function formatDateTime(
  value: string | Date,
  locale: Locale = DEFAULT_LOCALE,
  timeZone: string = getRequestTimeZone(),
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export type { Messages };
