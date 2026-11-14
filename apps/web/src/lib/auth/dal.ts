import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import {
  hasPermission,
  isRole,
  type AccountStatus,
  type Permission,
  type Role,
} from "@predictra/shared-types";
import { setRequestTimeZone } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  status: AccountStatus;
  roles: Role[];
  /** La sessione corrente ha completato la 2FA. */
  aal2: boolean;
  /** L'utente ha almeno un fattore TOTP verificato. */
  hasMfa: boolean;
}

/**
 * Data Access Layer: unico punto in cui si legge la sessione lato server.
 * Restituisce `null` se non c'è una sessione valida (JWT verificato da getClaims).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const sub = claimsData?.claims?.sub;
  if (!sub) return null;

  const [{ data: profile }, { data: roleRows }, { data: aal }, { data: tz }] = await Promise.all([
    supabase.from("profiles").select("id, email, display_name, status").eq("id", sub).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", sub),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from("user_preferences").select("timezone").eq("user_id", sub).maybeSingle(),
  ]);
  if (!profile) return null;
  // Le date della richiesta escono nel fuso scelto in Impostazioni → Preferenze.
  setRequestTimeZone(tz?.timezone);

  return {
    id: String(profile.id),
    email: String(profile.email),
    displayName: (profile.display_name as string | null) ?? null,
    status: profile.status as AccountStatus,
    roles: (roleRows ?? []).map((r: { role: unknown }) => r.role).filter(isRole),
    aal2: aal?.currentLevel === "aal2",
    hasMfa: aal?.nextLevel === "aal2",
  };
});

interface RequireOptions {
  /** Consente l'accesso anche senza ruolo (pagina di accettazione invito). */
  allowWithoutRole?: boolean;
}

/** Richiede un utente attivo, con ruolo, e con la 2FA completata se l'ha attivata. */
export async function requireUser(options: RequireOptions = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "SUSPENDED") redirect("/suspended");
  if (user.hasMfa && !user.aal2) redirect("/mfa");
  if (!options.allowWithoutRole && user.roles.length === 0) redirect("/accept-invite");
  return user;
}

/**
 * Richiede un permesso amministrativo. Gli amministratori devono avere la 2FA
 * attiva: senza, vengono mandati alla pagina di sicurezza. Il database
 * ricontrolla comunque ruolo, stato e AAL in ogni RPC.
 */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user.roles, permission)) redirect("/dashboard");
  if (!user.hasMfa) redirect("/settings/security?mfa=required");
  return user;
}
