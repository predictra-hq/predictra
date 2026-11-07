import type { Metadata } from "next";
import Link from "next/link";
import { highestRole } from "@predictra/shared-types";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const m = getMessages();
  const role = highestRole(user.roles);

  return (
    <>
      <PageHeader
        title={`${m.dashboard.welcome}, ${user.displayName ?? user.email}`}
        description={m.app.motto}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">{m.dashboard.agentStatus}</p>
          <p className="mt-2 text-sm">{m.dashboard.agentNotConfigured}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">{m.dashboard.dataFreshness}</p>
          <p className="mt-2 text-sm">{m.dashboard.noData}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">{m.dashboard.yourRole}</p>
          <p className="mt-2 text-sm">{role ? m.roles[role] : "—"}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">{m.dashboard.security}</p>
          <div className="mt-2">
            <Link href="/settings/security">
              <Badge tone={user.hasMfa ? "positive" : "warning"}>
                {user.hasMfa ? m.dashboard.mfaOn : m.dashboard.mfaOff}
              </Badge>
            </Link>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle>{m.dashboard.emptyTitle}</CardTitle>
        <p className="mt-2 max-w-3xl text-sm text-muted">{m.dashboard.emptyBody}</p>
      </Card>

      <p className="mt-8 text-xs text-subtle">{m.app.disclaimer}</p>
    </>
  );
}
