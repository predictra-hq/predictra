import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit" };

interface AuditRow {
  id: number;
  occurred_at: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  actor: { email: string } | null;
}

export default async function AuditPage() {
  const m = getMessages();
  await requirePermission("audit.read");
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select(
      "id, occurred_at, action, target_type, target_id, actor:profiles!audit_logs_actor_id_fkey(email)",
    )
    .order("occurred_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as AuditRow[];

  return (
    <>
      <PageHeader title={m.admin.auditTitle} description={m.admin.auditDescription} />
      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{m.admin.noAudit}</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {m.admin.when}
                </th>
                <th scope="col" className="px-4 py-3">
                  {m.admin.action}
                </th>
                <th scope="col" className="px-4 py-3">
                  {m.admin.actor}
                </th>
                <th scope="col" className="px-4 py-3">
                  {m.admin.target}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatDateTime(r.occurred_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-3">{r.actor?.email ?? "sistema"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {r.target_type}:{r.target_id}
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
