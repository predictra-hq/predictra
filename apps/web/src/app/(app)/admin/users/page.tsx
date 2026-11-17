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
import { ActionDialog } from "@/components/ui/action-dialog";
import { Alert, Badge, Card, Field, PageHeader, Select } from "@/components/ui/primitives";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { createClient } from "@/lib/supabase/server";
import { createPasswordResetLink, setAccountStatus, setUserRole } from "./actions";
import { SectionTabs } from "@/components/shell/section-tabs";
import { Limited } from "@/components/ui/limited";

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
  const d = m.admin.dialog;
  const dialogLabels = { cancel: d.cancel, close: d.close };

  return (
    <>
      <SectionTabs section="people" current="/admin/users" />
      <PageHeader title={m.admin.usersTitle} description={m.admin.usersDescription} />
      {error ? (
        <Alert tone="negative" className="mb-4">
          {m.admin.usersLoadError}
        </Alert>
      ) : null}
      <Card scrollLabel={m.admin.usersTitle} className="p-0">
        <Limited total={users.length}>
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
                const name = u.display_name ?? u.email ?? "";
                return (
                  <tr key={u.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {u.display_name ?? "—"}{" "}
                        {isSelf ? (
                          <span className="text-xs text-muted">({m.admin.you})</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {manageable && role ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{m.roles[role]}</span>
                          <ActionDialog
                            trigger={d.changeRole}
                            triggerVariant="ghost"
                            title={fillTemplate(d.roleTitle, { name })}
                            description={d.roleText}
                            confirm={m.admin.applyRole}
                            action={setUserRole}
                            fields={{ userId: u.id }}
                            labels={dialogLabels}
                          >
                            <Field label={m.admin.role} htmlFor={`role-${u.id}`}>
                              <Select id={`role-${u.id}`} name="role" defaultValue={role}>
                                {assignable.map((r) => (
                                  <option key={r} value={r}>
                                    {m.roles[r]}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          </ActionDialog>
                        </div>
                      ) : (
                        <span>{role ? m.roles[role] : "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.status === "ACTIVE" ? "positive" : "negative"}>
                        {m.accountStatus[u.status]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatDateTime(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-col items-end gap-2">
                        {manageable ? (
                          u.status === "ACTIVE" ? (
                            <ActionDialog
                              trigger={m.admin.suspend}
                              triggerVariant="danger"
                              title={fillTemplate(d.suspendTitle, { name })}
                              description={d.suspendText}
                              confirm={m.admin.suspend}
                              confirmVariant="danger"
                              action={setAccountStatus}
                              fields={{ userId: u.id, status: "SUSPENDED" }}
                              labels={dialogLabels}
                            />
                          ) : (
                            <ActionDialog
                              trigger={m.admin.reactivate}
                              title={fillTemplate(d.reactivateTitle, { name })}
                              description={d.reactivateText}
                              confirm={m.admin.reactivate}
                              action={setAccountStatus}
                              fields={{ userId: u.id, status: "ACTIVE" }}
                              labels={dialogLabels}
                            />
                          )
                        ) : null}
                        {manageable && u.status === "ACTIVE" ? (
                          <ActionDialog
                            trigger={m.admin.resetLink}
                            triggerVariant="ghost"
                            title={fillTemplate(d.resetTitle, { name })}
                            description={d.resetText}
                            confirm={d.generate}
                            action={createPasswordResetLink}
                            fields={{ userId: u.id }}
                            labels={dialogLabels}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Limited>
      </Card>
    </>
  );
}
