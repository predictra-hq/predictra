import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { FilterForm } from "@/components/ui/filter-form";
import { requirePermission } from "@/lib/auth/dal";
import {
  AUDIT_ACTIONS,
  auditHref,
  pageRange,
  parseAuditFilters,
  totalPages,
} from "@/lib/audit/filters";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { SectionTabs } from "@/components/shell/section-tabs";
import { Limited } from "@/components/ui/limited";

export const metadata: Metadata = { title: getMessages().pageTitles.adminAudit };

interface AuditRow {
  id: number;
  occurred_at: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  actor: { email: string } | null;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const m = getMessages();
  await requirePermission("audit.read");
  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const [start, end] = pageRange(filters.page);

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select(
      "id, occurred_at, action, target_type, target_id, metadata, actor:profiles!audit_logs_actor_id_fkey(email)",
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, end);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.from) query = query.gte("occurred_at", filters.from);
  if (filters.toExclusive) query = query.lt("occurred_at", filters.toExclusive);
  const { data, count } = await query;
  const rows = (data ?? []) as unknown as AuditRow[];
  const total = count ?? 0;
  const pages = totalPages(total);

  return (
    <>
      <SectionTabs section="people" current="/admin/audit" />
      <PageHeader title={m.admin.auditTitle} description={m.admin.auditDescription} />

      <FilterForm className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_10rem_auto_auto] sm:items-end">
        <Field label={m.admin.action} htmlFor="action">
          <Select id="action" name="action" defaultValue={filters.action ?? ""}>
            <option value="">{m.admin.allActions}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={m.admin.from} htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={one(params.from) ?? ""} />
        </Field>
        <Field label={m.admin.to} htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={one(params.to) ?? ""} />
        </Field>
        <Button type="submit" variant="secondary">
          {m.admin.filter}
        </Button>
        <Link href="/admin/audit" className="h-10 content-center text-sm text-muted hover:text-fg">
          {m.admin.resetFilters}
        </Link>
      </FilterForm>

      <Card scrollLabel={m.admin.auditTitle} className="p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{m.admin.noAudit}</p>
        ) : (
          <Limited total={rows.length}>
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">{m.admin.auditTitle}</caption>
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
                  <tr key={r.id} className="border-b border-border align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatDateTime(r.occurred_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                    <td className="px-4 py-3">{r.actor?.email ?? m.admin.system}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {r.target_type}:{r.target_id}
                      {r.metadata && Object.keys(r.metadata).length > 0 ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer">{m.admin.details}</summary>
                          <pre className="mt-1 whitespace-pre-wrap break-all">
                            {JSON.stringify(r.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Limited>
        )}
      </Card>

      <nav aria-label="Paginazione" className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">
          {m.admin.pageOf
            .replace("{page}", String(Math.min(filters.page, pages)))
            .replace("{pages}", String(pages))
            .replace("{count}", String(total))}
        </span>
        <span className="flex gap-3">
          {filters.page > 1 ? (
            <Link href={auditHref(params, filters.page - 1)} className="hover:text-fg">
              ← {m.admin.previous}
            </Link>
          ) : null}
          {filters.page < pages ? (
            <Link href={auditHref(params, filters.page + 1)} className="hover:text-fg">
              {m.admin.next} →
            </Link>
          ) : null}
        </span>
      </nav>
    </>
  );
}
