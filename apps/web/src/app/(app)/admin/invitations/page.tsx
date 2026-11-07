import type { Metadata } from "next";
import { canGrantRole, ROLES, type InvitationStatus, type Role } from "@predictra/shared-types";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import {
  Badge,
  Card,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { createInvitation, revokeInvitation } from "./actions";

export const metadata: Metadata = { title: "Inviti" };

const statusTone: Record<InvitationStatus, "neutral" | "positive" | "negative" | "warning"> = {
  PENDING: "warning",
  ACCEPTED: "positive",
  REVOKED: "negative",
  EXPIRED: "neutral",
};

interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  sent_at: string | null;
  send_error: string | null;
}

export default async function InvitationsPage() {
  const m = getMessages();
  const user = await requirePermission("invitations.manage");
  const supabase = await createClient();
  const { data } = await supabase
    .from("invitations")
    .select("id, email, role, status, created_at, expires_at, sent_at, send_error")
    .order("created_at", { ascending: false })
    .limit(200);
  const invitations = (data ?? []) as InvitationRow[];
  const grantable = ROLES.filter((r) => canGrantRole(user.roles, r));

  return (
    <>
      <PageHeader title={m.admin.invitationsTitle} description={m.admin.invitationsDescription} />

      <Card className="mb-6">
        <CardTitle>{m.admin.invite}</CardTitle>
        <ActionForm
          action={createInvitation}
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end"
        >
          <Field label={m.common.email} htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="off" required />
          </Field>
          <Field label={m.admin.role} htmlFor="role">
            <Select id="role" name="role" defaultValue="USER">
              {grantable.map((r) => (
                <option key={r} value={r}>
                  {m.roles[r]}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton>{m.admin.invite}</SubmitButton>
        </ActionForm>
      </Card>

      <Card className="overflow-x-auto p-0">
        {invitations.length === 0 ? (
          <p className="p-5 text-sm text-muted">{m.admin.noInvitations}</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {m.common.email}
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
                  {m.admin.expiresAt}
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    {inv.email}
                    {inv.send_error ? (
                      <p className="text-xs text-negative-strong">{m.admin.linkFailed}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{m.roles[inv.role]}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[inv.status]}>{m.invitationStatus[inv.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(inv.created_at)}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(inv.expires_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {inv.status === "PENDING" && canGrantRole(user.roles, inv.role) ? (
                      <ActionForm
                        action={revokeInvitation}
                        className="inline-flex flex-col items-end gap-1"
                      >
                        <input type="hidden" name="id" value={inv.id} />
                        <SubmitButton variant="danger" className="h-8 px-3 text-xs">
                          {m.admin.revoke}
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
