/**
 * Contratto M8 — squadre e campionati seguiti da un utente.
 *
 * Specchia `supabase/migrations/20261117100000_user_follows.sql` (verificato da
 * `supabase/tests/follows.test.ts`). Dizionario: docs/data-dictionary/identity.md.
 */

/** Righe al massimo per utente, come nel trigger `user_follows_limit`. */
export const FOLLOW_LIMIT = 50;

/** Messaggio dell'errore del database quando il limite è raggiunto. */
export const FOLLOW_LIMIT_REACHED = "FOLLOW_LIMIT_REACHED";

/** Riga di `public.user_follows`: segue una squadra oppure un campionato, mai entrambi. */
export interface UserFollowRow {
  id: number;
  user_id: string;
  team_id: number | null;
  competition_id: number | null;
  created_at: string;
}
