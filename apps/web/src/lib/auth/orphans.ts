import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Mai attivato: nessun ruolo e nessun invito accettato. */
export function isNeverActivated(counts: {
  roles: number | null;
  acceptedInvitations: number | null;
}): boolean {
  return counts.roles === 0 && counts.acceptedInvitations === 0;
}

/**
 * Elimina l'utente auth creato da un invito che non è mai stato completato, e con lui i
 * link ancora in giro. "Mai completato" si decide dai ruoli e non dall'ultimo accesso:
 * aprire il link registra un accesso anche se poi nessuno imposta nome e password, e
 * quell'utente a metà impedirebbe di generare un nuovo invito per la stessa email.
 *
 * Un ruolo si riceve solo accettando un invito (`accept_invitation`): chi non ha ruoli né
 * inviti accettati non ha mai potuto usare l'app e non ha dati propri. Se una delle due
 * letture fallisce non si elimina nulla.
 *
 * Da chiamare solo dopo che una RPC ha autorizzato l'operazione dell'amministratore.
 */
export async function removeNeverActivatedUser(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  const [roles, accepted] = await Promise.all([
    admin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId),
    admin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("auth_user_id", userId)
      .eq("status", "ACCEPTED"),
  ]);
  if (roles.error || accepted.error) return false;
  if (!isNeverActivated({ roles: roles.count, acceptedInvitations: accepted.count })) return false;
  const { error } = await admin.auth.admin.deleteUser(userId);
  return !error;
}
