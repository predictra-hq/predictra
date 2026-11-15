/**
 * Ruoli e permessi applicativi di PREDICTRA.
 *
 * Questa è la fonte di verità lato applicazione. Le stesse regole sono applicate
 * anche nel database (RLS e funzioni `SECURITY DEFINER` in supabase/migrations):
 * l'interfaccia non è mai l'unico controllo.
 */

export const ROLES = ["SUPER_ADMIN", "ADMIN", "USER"] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const INVITATION_STATUSES = ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const PERMISSIONS = [
  "invitations.manage",
  "users.read",
  "users.manage",
  "users.assign_role",
  "settings.global",
  "providers.manage",
  "agents.monitor",
  "audit.read",
  "models.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Matrice ruolo → permessi.
 *
 * Nota: nessun ruolo concede l'accesso ai dati finanziari personali (bankroll,
 * puntate) di altri utenti. Quell'accesso richiederà un grant esplicito e
 * tracciato (vedi prompt master §3.1), non un ruolo.
 */
const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  SUPER_ADMIN: PERMISSIONS,
  ADMIN: ["invitations.manage", "users.read", "users.manage", "agents.monitor"],
  USER: [],
};

/** Gerarchia dei ruoli (valore più alto = più privilegi). */
const ROLE_RANK: Readonly<Record<Role, number>> = {
  USER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

/** Ruolo più alto posseduto dall'utente, o `null` se nessuno. */
export function highestRole(roles: readonly Role[]): Role | null {
  let best: Role | null = null;
  for (const role of roles) {
    if (best === null || ROLE_RANK[role] > ROLE_RANK[best]) best = role;
  }
  return best;
}

/**
 * Un attore può assegnare (o invitare con) un ruolo solo se:
 * - ha il permesso di gestire utenti/inviti, e
 * - il ruolo è strettamente inferiore al proprio, oppure l'attore è SUPER_ADMIN.
 *
 * Così un ADMIN può invitare solo USER, mentre i SUPER_ADMIN (tutti con pari
 * privilegi) possono creare altri SUPER_ADMIN.
 */
export function canGrantRole(actorRoles: readonly Role[], target: Role): boolean {
  const actor = highestRole(actorRoles);
  if (actor === null) return false;
  if (actor === "SUPER_ADMIN") return true;
  if (!hasPermission(actorRoles, "invitations.manage")) return false;
  return ROLE_RANK[target] < ROLE_RANK[actor];
}

/**
 * Un attore può sospendere/riattivare un altro account solo se ha `users.manage`
 * e il bersaglio ha un ruolo strettamente inferiore (i SUPER_ADMIN possono agire
 * su tutti tranne che su se stessi, per non bloccarsi fuori).
 */
export function canManageAccount(
  actorRoles: readonly Role[],
  targetRoles: readonly Role[],
  isSelf: boolean,
): boolean {
  if (isSelf) return false;
  if (!hasPermission(actorRoles, "users.manage")) return false;
  const actor = highestRole(actorRoles);
  const target = highestRole(targetRoles) ?? "USER";
  if (actor === "SUPER_ADMIN") return true;
  return actor !== null && ROLE_RANK[target] < ROLE_RANK[actor];
}
