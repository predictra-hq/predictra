/**
 * Contratto M8 — Ask PREDICTRA: quota giornaliera per utente.
 *
 * Specchia `supabase/migrations/20261109130000_ask.sql` (verificato da
 * `supabase/tests/ask.test.ts`). Dizionario: docs/data-dictionary/ask.md.
 * Decisione: ADR 0042.
 */

/** Domande al giorno per utente (giorno in UTC), come `app_private.ask_daily_limit()`. */
export const ASK_DAILY_LIMIT = 30;

/** Messaggio dell'errore di `ask_consume()` quando la quota è finita. */
export const ASK_QUOTA_EXCEEDED = "ASK_QUOTA_EXCEEDED";

/** Riga di `public.ask_usage`: solo contatori, mai il testo delle domande. */
export interface AskUsageRow {
  user_id: string;
  day: string;
  questions: number;
  tokens: number;
  rejected: number;
  updated_at: string;
}
