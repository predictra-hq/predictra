import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, highestRole } from "@predictra/shared-types";
import { AgentStatusCard } from "@/components/agent/agent-status-card";
import { NotificationsCard } from "@/components/agent/notifications-card";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { FreshnessBadge } from "@/components/football/badges";
import { getSourceHealth } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const m = getMessages();
  const role = highestRole(user.roles);
  // Freschezza dei dati in uso: la fonte più aggiornata tra quelle con termini verificati.
  const sources = (await getSourceHealth().catch(() => [])).filter(
    (s) => s.terms_verified_at && s.last_success_at,
  );
  const latest = sources.sort((a, b) =>
    (b.last_success_at ?? "").localeCompare(a.last_success_at ?? ""),
  )[0];
  const lastSuccess = latest?.last_success_at ?? null;
  const freshness = latest?.freshness ?? null;

  return (
    <>
      <PageHeader
        title={`${m.dashboard.welcome}, ${user.displayName ?? user.email}`}
        description={m.app.motto}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AgentStatusCard canMonitor={hasPermission(user.roles, "agents.monitor")} />
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">{m.dashboard.dataFreshness}</p>
          {lastSuccess ? (
            <Link href="/data-center" className="mt-2 flex flex-col gap-1">
              <FreshnessBadge freshness={freshness} />
              <span className="text-xs text-muted">
                {m.dashboard.lastUpdate}: {formatDateTime(lastSuccess)}
              </span>
            </Link>
          ) : (
            <p className="mt-2 text-sm">{m.dashboard.noData}</p>
          )}
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

      <NotificationsCard />

      <Card className="mt-6">
        <CardTitle>{m.dashboard.emptyTitle}</CardTitle>
        <p className="mt-2 max-w-3xl text-sm text-muted">{m.dashboard.emptyBody}</p>
      </Card>

      <p className="mt-8 text-xs text-subtle">{m.app.disclaimer}</p>
    </>
  );
}
