import type { Metadata } from "next";
import {
  canGrantRole,
  canManageAccount,
  highestRole,
  isRole,
  ROLES,
  type AccountStatus,
  type Role,
} from "@predictra/shared-types";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Alert, Badge, Card, PageHeader, Select } from "@/components/ui/primitives";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { createPasswordResetLink, setAccountStatus, setUserRole } from "./actions";

export const metadata: Metadata = { title: "Utenti" };

interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  status: AccountStatus;
  created_at: string;
  user_roles: { role: string }[];
}

export default async function UsersPage() {
  const m = getMessages();
  const actor = await requirePermission("users.read");
  const supabase = await createClient();
  // Solo dati di identità: nessun dato finanziario personale è accessibile da qui.
  // user_roles ha due chiavi verso profiles (user_id e granted_by): la relazione va
  // indicata, altrimenti PostgREST risponde con un errore di ambiguità (PGRST201).
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, status, created_at, user_roles!user_roles_user_id_fkey(role)")
    .order("created_at", { ascending: true })
    .limit(500);
  const users = (data ?? []) as ProfileRow[];

  return (
    <>
      <PageHeader title={m.admin.usersTitle} description={m.admin.usersDescription} />
      {error ? (
        <Alert tone="negative" className="mb-4">
          {m.admin.usersLoadError}
        </Alert>
      ) : null}
      <Card scrollLabel={m.admin.usersTitle} className="p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <caption className="sr-only">{m.admin.usersTitle}</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">
                {m.admin.name}
              </th>
              <th scope="col" className="px-4 py-3">
                {m.admin.role}
              </th>
              <th scope="col" className="px-4 py-3">
                {m.admin.status}
              </th>
              <th scope="col" className="px-4 py-3">
                {m.admin.createdAt}
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Azioni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const roles: Role[] = u.user_roles.map((r) => r.role).filter(isRole);
              const role = highestRole(roles);
              const isSelf = u.id === actor.id;
              const manageable = canManageAccount(actor.roles, roles, isSelf);
              const assignable = ROLES.filter((r) => canGrantRole(actor.roles, r));
              return (
                <tr key={u.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {u.display_name ?? "—"}{" "}
                      {isSelf ? <span className="text-xs text-muted">({m.admin.you})</span> : null}
                    </p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {manageable && role ? (
                      <ActionForm
                        action={setUserRole}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="userId" value={u.id} />
                        <Select
                          name="role"
                          defaultValue={role}
                          aria-label={m.admin.role}
                          className="h-8 w-36 text-xs"
                        >
                          {assignable.map((r) => (
                            <option key={r} value={r}>
                              {m.roles[r]}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton variant="secondary" className="h-8 px-3 text-xs">
                          {m.admin.applyRole}
                        </SubmitButton>
                      </ActionForm>
                    ) : (
                      <span>{role ? m.roles[role] : "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={u.status === "ACTIVE" ? "positive" : "negative"}>
                      {m.accountStatus[u.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(u.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {manageable ? (
                      <ActionForm
                        action={setAccountStatus}
                        className="inline-flex flex-col items-end gap-1"
                      >
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                        />
                        <SubmitButton
                          variant={u.status === "ACTIVE" ? "danger" : "secondary"}
                          className="h-8 px-3 text-xs"
                        >
                          {u.status === "ACTIVE" ? m.admin.suspend : m.admin.reactivate}
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                    {manageable && u.status === "ACTIVE" ? (
                      <ActionForm
                        action={createPasswordResetLink}
                        className="mt-2 flex flex-col items-end gap-1"
                      >
                        <input type="hidden" name="userId" value={u.id} />
                        <SubmitButton variant="ghost" className="h-8 px-3 text-xs">
                          {m.admin.resetLink}
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
