import { it, type Messages } from "./it";

export const LOCALES = ["it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "it";

const dictionaries: Record<Locale, Messages> = { it };

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return dictionaries[locale];
}

export function formatDateTime(
  value: string | Date,
  locale: Locale = DEFAULT_LOCALE,
  timeZone = "Europe/Rome",
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export type { Messages };
