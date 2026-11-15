import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@predictra/shared-types";
import { NotificationsCard } from "@/components/agent/notifications-card";
import {
  BankrollCard,
  CertaintiesCard,
  SchedineCard,
  SystemStatusCard,
} from "@/components/dashboard/cards";
import { Alert, CardSkeleton, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: "Home" };

/**
 * Home: in alto le certezze delle prossime 72 ore, sotto bankroll, schedine consigliate
 * e stato del sistema. Le partite hanno la loro pagina. Solo dati reali: ogni riquadro degrada da solo con un messaggio se il suo
 * dato non è disponibile. Le notifiche compaiono solo quando ce ne sono.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const m = getMessages();
  const d = m.dashboard;

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

      <Suspense fallback={<CardSkeleton />}>
        <CertaintiesCard />
      </Suspense>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<CardSkeleton />}>
          <BankrollCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <SchedineCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <SystemStatusCard canMonitor={hasPermission(user.roles, "agents.monitor")} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <NotificationsCard />
      </Suspense>

      <p className="mt-8 text-xs text-subtle">{m.app.disclaimer}</p>
    </>
  );
}
