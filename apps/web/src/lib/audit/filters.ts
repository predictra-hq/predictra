/** Filtri e paginazione della pagina Audit (M8). */

/** Azioni registrate dalle RPC (supabase/migrations: app_private.audit). */
export const AUDIT_ACTIONS = [
  "invitation.created",
  "invitation.revoked",
  "invitation.accepted",
  "account.suspended",
  "account.reactivated",
  "user.role_changed",
  "user.password_reset_link",
  "team_alias.added",
  "model.activated",
  "agent.job_retried",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_PAGE_SIZE = 50;

export interface AuditFilters {
  action: AuditAction | null;
  /** Inizio del giorno `from` (UTC), incluso. */
  from: string | null;
  /** Fine del giorno `to` (UTC): primo istante del giorno dopo, escluso. */
  toExclusive: string | null;
  page: number;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseAuditFilters(
  params: Record<string, string | string[] | undefined>,
): AuditFilters {
  const action = one(params.action);
  const from = one(params.from);
  const to = one(params.to);
  const page = Number(one(params.page));
  const validDay = (d: string | undefined) =>
    d && DAY.test(d) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()) ? d : null;
  const toDay = validDay(to);
  return {
    action: AUDIT_ACTIONS.includes(action as AuditAction) ? (action as AuditAction) : null,
    from: validDay(from) ? `${from}T00:00:00.000Z` : null,
    toExclusive: toDay
      ? new Date(new Date(`${toDay}T00:00:00Z`).getTime() + 86_400_000).toISOString()
      : null,
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** Intervallo di righe (0-based, estremi inclusi) per `range()` di PostgREST. */
export function pageRange(page: number, size = AUDIT_PAGE_SIZE): [number, number] {
  return [(page - 1) * size, page * size - 1];
}

export function totalPages(count: number, size = AUDIT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / size));
}

/** Query string della pagina `page` mantenendo gli altri filtri. */
export function auditHref(
  params: Record<string, string | string[] | undefined>,
  page: number,
): string {
  const q = new URLSearchParams();
  for (const key of ["action", "from", "to"]) {
    const v = one(params[key]);
    if (v) q.set(key, v);
  }
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return `/admin/audit${s ? `?${s}` : ""}`;
}
