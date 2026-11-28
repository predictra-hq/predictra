import type { Metadata } from "next";
import Link from "next/link";
import { isFeedbackKind } from "@predictra/shared-types";
import { SectionTabs } from "@/components/shell/section-tabs";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: getMessages().pageTitles.adminFeedback };

/** Solo percorsi interni diventano collegamenti (lo stesso vincolo del database). */
const INTERNAL_PATH = /^\/([^/\s]\S*)?$/;

interface FeedbackRow {
  id: number;
  kind: string;
  body: string;
  page: string | null;
  created_at: string;
  author_name: string;
  author_email: string;
}

/**
 * Feedback ricevuti (ADR 0081): idee, problemi e apprezzamenti degli iscritti, dal più
 * recente. Li legge `admin_feedback_list`, che ricontrolla ruolo e sessione con 2FA.
 */
export default async function AdminFeedbackPage() {
  const m = getMessages();
  const f = m.feedback;
  await requirePermission("users.read");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_feedback_list", { p_limit: 200 });
  const rows = (data ?? []) as FeedbackRow[];

  return (
    <>
      <SectionTabs section="people" current="/admin/feedback" />
      <PageHeader title={f.adminTitle} description={f.adminDescription} />
      {error ? (
        <EmptyState>{m.common.genericError}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>{f.adminEmpty}</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((x) => (
            <li key={x.id}>
              <Card className="h-full">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={x.kind === "PROBLEM" ? "warning" : "positive"}>
                    {isFeedbackKind(x.kind) ? f.kinds[x.kind] : x.kind}
                  </Badge>
                  <time dateTime={x.created_at} className="text-xs text-subtle">
                    {formatDateTime(x.created_at)}
                  </time>
                </div>
                <p className="whitespace-pre-line break-words text-sm">{x.body}</p>
                <p className="mt-2 truncate text-xs text-muted">
                  {x.author_name} · {x.author_email}
                  {x.page && INTERNAL_PATH.test(x.page) ? (
                    <>
                      {" · "}
                      <Link href={x.page} className="text-positive-strong hover:underline">
                        {x.page}
                      </Link>
                    </>
                  ) : null}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
