/**
 * Contratto M8 — comunità: data di nascita, stile del nome, commenti alle partite.
 *
 * Specchia `supabase/migrations/20261117190000_community.sql` (verificato da
 * `supabase/tests/community.test.ts`). Dizionario: docs/data-dictionary/identity.md.
 */

/** Colori del nome, come il vincolo `profiles_name_color_check`. */
export const NAME_COLORS = [
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "orange",
  "amber",
  "red",
] as const;
export type NameColor = (typeof NAME_COLORS)[number];

/** Stili di scritta del nome, come il vincolo `profiles_name_style_check`. */
export const NAME_STYLES = ["bold", "italic", "mono", "caps"] as const;
export type NameStyle = (typeof NAME_STYLES)[number];

/** Età minima dichiarata per leggere e scrivere i commenti. */
export const ADULT_AGE = 18;

/** Lunghezza massima di un commento, come il vincolo su `match_comments.body`. */
export const COMMENT_MAX_LENGTH = 500;

/** Errori del database. */
export const BIRTH_DATE_INVALID = "BIRTH_DATE_INVALID";
export const COMMENT_RATE_LIMIT = "COMMENT_RATE_LIMIT";

export function isNameColor(value: unknown): value is NameColor {
  return typeof value === "string" && (NAME_COLORS as readonly string[]).includes(value);
}

export function isNameStyle(value: unknown): value is NameStyle {
  return typeof value === "string" && (NAME_STYLES as readonly string[]).includes(value);
}

/** Riga di `public.user_birthdays`: la vede solo il proprietario. */
export interface UserBirthdayRow {
  user_id: string;
  birth_date: string;
  show_birthday: boolean;
  updated_at: string;
}

/** Riga di `public.match_comment_feed(p_match_id)`: mai l'id né l'email dell'autore. */
export interface MatchCommentFeedRow {
  id: number;
  body: string;
  created_at: string;
  author_name: string;
  name_color: NameColor | null;
  name_style: NameStyle | null;
  is_own: boolean;
}

/** Riga di `public.birthdays_today()`. */
export interface BirthdayTodayRow {
  display_name: string;
  name_color: NameColor | null;
  name_style: NameStyle | null;
}
