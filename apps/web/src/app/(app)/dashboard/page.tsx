import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@predictra/shared-types";
import { NotificationsCard } from "@/components/agent/notifications-card";
import {
  AlertsCard,
  BankrollCard,
  CertaintiesCard,
  SchedineCard,
  SystemStatusCard,
  UpcomingMatchesCard,
} from "@/components/dashboard/cards";
import { LeaguesCard, ModelHitsCard } from "@/components/dashboard/charts";
import { FollowedMatchesCard } from "@/components/dashboard/followed-card";
import { Alert, CardSkeleton, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { BirthdaysCard } from "@/components/community/birthdays-card";

export const metadata: Metadata = { title: "Home" };

/**
 * Home: in alto le certezze delle prossimi 7 giorni, sotto bankroll, schedine consigliate
 * e stato del sistema. Le partite hanno la loro pagina. Solo dati reali: ogni riquadro degrada da solo con un messaggio se il suo
 * dato non è disponibile. Le notifiche compaiono solo quando ce ne sono.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const m = getMessages();
  const d = m.dashboard;
  const canMonitor = hasPermission(user.roles, "agents.monitor");

  return (
    <>
      <PageHeader title={`${d.welcome}, ${user.displayName ?? user.email.split("@")[0]}`} />

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

      {/* Compleanni di oggi, solo di chi li rende visibili; senza nessuno non compare. */}
      <Suspense fallback={null}>
        <BirthdaysCard />
      </Suspense>

      {/* Ciò che richiede attenzione adesso; senza nulla da dire non compare. */}
      <Suspense fallback={null}>
        <AlertsCard />
      </Suspense>

      {/* Tre riquadri di sintesi: ognuno porta alla sua sezione e si carica da solo. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Suspense fallback={<CardSkeleton />}>
          <CertaintiesCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <SchedineCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <BankrollCard />
        </Suspense>
      </div>

      {/* Prossime partite delle squadre seguite; senza seguiti non compare. */}
      <Suspense fallback={null}>
        <FollowedMatchesCard />
      </Suspense>

      {/* Calendario con le probabilità e due grafici: resa del modello e campionati. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<CardSkeleton />}>
          <UpcomingMatchesCard />
        </Suspense>
        <div className="flex flex-col gap-4">
          <Suspense fallback={<CardSkeleton />}>
            <ModelHitsCard />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <LeaguesCard />
          </Suspense>
        </div>
      </div>

      {/* Stato tecnico e avvisi dell'agente: solo per chi gestisce il sistema. */}
      {canMonitor ? (
        <>
          <div className="mt-4">
            <Suspense fallback={<CardSkeleton />}>
              <SystemStatusCard canMonitor />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <NotificationsCard />
          </Suspense>
        </>
      ) : null}

      <p className="mt-8 text-xs text-subtle">{m.app.disclaimer}</p>
    </>
  );
}
