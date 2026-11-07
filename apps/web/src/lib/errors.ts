import { getMessages } from "@/lib/i18n";

/** SQLSTATE sollevati intenzionalmente dalle RPC, con messaggi già pensati per l'utente. */
const USER_FACING_CODES = new Set(["42501", "23505", "22023", "P0002", "54000", "23514", "28000"]);

/**
 * Converte un errore Supabase/PostgREST in un messaggio sicuro da mostrare.
 * I dettagli tecnici non vengono mai esposti al client.
 */
export function toUserMessage(
  error: { code?: string; message?: string } | null | undefined,
): string {
  const m = getMessages();
  if (!error) return m.common.genericError;
  if (error.code === "23505" && error.message?.includes("invitations_one_pending_per_email")) {
    return "Esiste già un invito in attesa per questa email.";
  }
  if (error.code && USER_FACING_CODES.has(error.code) && error.message) return error.message;
  return m.common.genericError;
}

/**
 * Esito di una Server Action. `link` contiene un link monouso (invito o reset
 * password) da mostrare UNA volta all'amministratore: non viene salvato.
 */
export type ActionState = { ok: boolean; message: string; link?: string } | null;
