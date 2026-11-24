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
  /** Immagine del profilo dell'autore (`profiles.avatar_style`), visibile a tutti. */
  avatar_style: string | null;
  is_own: boolean;
}

/** Riga di `public.birthdays_today()`. */
export interface BirthdayTodayRow {
  display_name: string;
  name_color: NameColor | null;
  name_style: NameStyle | null;
}

/**
 * Tipi di immagine del profilo (`profiles.avatar_style`, migrazione
 * `20261118120000_avatar_style.sql`), tutti nel verde del sito. Vuoto = «classic».
 */
export const AVATAR_STYLES = ["classic", "outline", "ball", "line", "initial"] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number];

export function isAvatarStyle(value: unknown): value is AvatarStyle {
  return typeof value === "string" && (AVATAR_STYLES as readonly string[]).includes(value);
}

/** Riga di `public.recent_comment_feed(p_limit)`: ultimi commenti di tutte le partite. */
export interface RecentCommentRow extends MatchCommentFeedRow {
  match_id: number;
  home_team: string;
  away_team: string;
  kickoff_at: string;
}

/** Chat della comunità (`community_posts.channel`, ADR 0064). */
export const COMMUNITY_CHANNELS = ["GENERAL", "SLIPS"] as const;
export type CommunityChannel = (typeof COMMUNITY_CHANNELS)[number];

/** Riepilogo di una schedina condivisa: solo testo da mostrare, mai usato per calcoli. */
export interface SharedSlip {
  title: string;
  picks: {
    match: string;
    pick: string;
    price: number | null;
    /**
     * Giocata come `partita|mercato|linea|esito` (ADR 0070): serve a mostrare in chat se la
     * schedina è vinta o persa quando le partite finiscono. Assente nelle condivisioni
     * precedenti.
     */
    key?: string;
  }[];
  price: number | null;
  probability: number | null;
}

/** Reazione a un messaggio: emoji, quante persone, se c'è anche la propria. */
export interface CommunityReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

/** Emoji ammesse nelle reazioni (vincolo `community_reactions_emoji_check`). */
export const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂", "😮", "😢", "👏", "⚽"] as const;

/** Riga di `public.community_feed(p_channel, p_limit)`: mai l'id né l'email dell'autore. */
export interface CommunityPostRow {
  id: number;
  channel: CommunityChannel;
  body: string;
  slip: SharedSlip | null;
  created_at: string;
  author_name: string;
  name_color: NameColor | null;
  name_style: NameStyle | null;
  avatar_style: string | null;
  is_own: boolean;
  /** Reazioni di tutti (ADR 0070). */
  reactions?: CommunityReaction[];
}
