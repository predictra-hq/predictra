import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission } from "@predictra/shared-types";
import { NotificationsCard } from "@/components/agent/notifications-card";
import {
  BankrollCard,
  SchedineCard,
  SystemStatusCard,
  UpcomingMatchesCard,
} from "@/components/dashboard/cards";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { hasActiveModel } from "@/lib/predictions/queries";

export const metadata: Metadata = { title: "Home" };

/**
 * Home: in alto bankroll, schedine consigliate e stato del sistema; sotto le prossime
 * partite. Solo dati reali: ogni riquadro degrada da solo con un messaggio se il suo
 * dato non è disponibile. Le notifiche compaiono solo quando ce ne sono.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const m = getMessages();
  const d = m.dashboard;
  const hasModel = await hasActiveModel().catch(() => false);

  return (
    <>
      <PageHeader title={`${d.welcome}, ${user.displayName ?? user.email}`} />

      {!user.hasMfa ? (
        <Alert tone="warning" className="mb-6">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{d.mfaWarning}</span>
            <Link href="/settings/security" className="font-medium underline underline-offset-2">
              {d.mfaWarningAction}
            </Link>
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BankrollCard />
        <SchedineCard />
        <SystemStatusCard canMonitor={hasPermission(user.roles, "agents.monitor")} />
      </div>

      <NotificationsCard />

      <div className="mt-6">
        <UpcomingMatchesCard hasModel={hasModel} />
      </div>

      <p className="mt-8 text-xs text-subtle">{m.app.disclaimer}</p>
    </>
  );
}
