/**
 * Requisiti della password, gli stessi di Supabase Auth (`supabase/config.toml`:
 * almeno 12 caratteri, lettere e numeri). Funzione pura: la usano i controlli che si
 * aggiornano mentre si scrive e lo schema di validazione sul server.
 */
export const PASSWORD_MIN_LENGTH = 12;

export type PasswordCheck = "length" | "letter" | "digit" | "match";

export function passwordChecks(password: string, confirm: string): Record<PasswordCheck, boolean> {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    letter: /\p{L}/u.test(password),
    digit: /\d/.test(password),
    match: password.length > 0 && password === confirm,
  };
}
