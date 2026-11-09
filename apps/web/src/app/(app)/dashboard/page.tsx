import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission } from "@predictra/shared-types";
import { AgentStatusCard } from "@/components/agent/agent-status-card";
import { NotificationsCard } from "@/components/agent/notifications-card";
import {
  ActiveModelCard,
  BankrollCard,
  ExploreGrid,
  ProposalsCard,
  UpcomingMatchesCard,
} from "@/components/dashboard/cards";
import { FreshnessBadge } from "@/components/football/badges";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getSourceHealth } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { hasActiveModel } from "@/lib/predictions/queries";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard: solo dati reali (fonti, modello attivo, bankroll personale, proposte).
 * Ogni riquadro degrada da solo con un messaggio se il suo dato non è disponibile.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const m = getMessages();
  const d = m.dashboard;
  const [sourcesAll, hasModel] = await Promise.all([
    getSourceHealth().catch(() => []),
    hasActiveModel().catch(() => false),
  ]);
  // Freschezza dei dati in uso: la fonte più aggiornata tra quelle con termini verificati.
  const latest = sourcesAll
    .filter((s) => s.terms_verified_at && s.last_success_at)
    .sort((a, b) => (b.last_success_at ?? "").localeCompare(a.last_success_at ?? ""))[0];

  return (
    <>
      <PageHeader
        title={`${d.welcome}, ${user.displayName ?? user.email}`}
        description={m.app.motto}
      />

      {!user.hasMfa ? (
        <Alert tone="warning" className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <span>{d.mfaWarning}</span>
          <Link href="/settings/security" className="font-medium underline underline-offset-2">
            {d.mfaWarningAction}
          </Link>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BankrollCard />
        <ActiveModelCard />
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">{d.dataFreshness}</p>
          {latest?.last_success_at ? (
            <Link href="/data-center" className="mt-2 flex flex-col gap-1">
              <span>
                <FreshnessBadge freshness={latest.freshness ?? null} />
              </span>
              <span className="text-xs text-muted">
                {d.lastUpdate}: {formatDateTime(latest.last_success_at)}
              </span>
            </Link>
          ) : (
            <p className="mt-2 text-sm text-muted">{d.noData}</p>
          )}
        </Card>
        <AgentStatusCard canMonitor={hasPermission(user.roles, "agents.monitor")} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <UpcomingMatchesCard hasModel={hasModel} />
        <ProposalsCard />
      </div>

      <NotificationsCard />

      <ExploreGrid />

      <p className="mt-8 text-xs text-subtle">{m.app.disclaimer}</p>
    </>
  );
}
