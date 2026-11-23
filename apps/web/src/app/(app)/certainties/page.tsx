import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown } from "lucide-react";
import { PickRow } from "@/components/certainties/pick-chip";
import { Alert, Card, CardSkeleton, EmptyState, PageHeader } from "@/components/ui/primitives";
import { italianPriceFor } from "@/lib/bet-builder/likely";
import { requireUser } from "@/lib/auth/dal";
import { loadUpcoming, loadVerification } from "@/lib/certainties/load";
import {
  bandStats,
  DEFAULT_THRESHOLD,
  flatReturn,
  groupByCompetition,
  groupByMatch,
  pastValueMultiples,
  selectPicks,
  type BandStat,
} from "@/lib/certainties/logic";
import { listCompetitions } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { formatPercent } from "@/lib/predictions/format";
import { getActiveHistoryCheck, hasActiveModel } from "@/lib/predictions/queries";

const formatCount = (n: number) =>
  new Intl.NumberFormat("it-IT", { useGrouping: "always" }).format(n);

export const metadata: Metadata = { title: "Certezze" };

/** Sotto questo numero di giocate la percentuale uscita è troppo ballerina. */
const MIN_SAMPLE = 30;

/** Quante volte sono uscite le stesse giocate sulle partite già giocate. */
function Reliability({
  stats,
  wins,
  count,
  roi,
  history,
}: {
  stats: BandStat[];
  wins: number;
  count: number;
  roi: number | null;
  /** Verifica storica per fascia (ADR 0057): usata dove le giocate recenti sono poche. */
  history: ReadonlyMap<number, { wins: number; count: number }>;
}) {
  const c = getMessages().certainties;
  const shown = stats.filter((s) => s.count > 0);
  const historyFor = (from: number) => {
    const h = history.get(from);
    return h && h.count >= MIN_SAMPLE ? h : null;
  };
  return (
    <details className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
      <summary className="cursor-pointer text-sm font-medium text-muted hover:text-fg">
        {c.reliability}
      </summary>
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{c.verifyEmpty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {shown.map((s) => (
            <li key={s.from} className="flex items-center justify-between gap-3 py-2">
              <span className="text-muted">
                {fillTemplate(c.bandLabel, { from: formatPercent(s.from, 0) })}
              </span>
              <span className="text-right">
                {s.count >= MIN_SAMPLE ? (
                  fillTemplate(c.bandResult, {
                    observed: formatPercent(s.observed, 0),
                    wins: String(s.wins),
                    count: String(s.count),
                  })
                ) : historyFor(s.from) ? (
                  <>
                    {fillTemplate(c.bandHistory, {
                      observed: formatPercent(
                        historyFor(s.from)!.wins / historyFor(s.from)!.count,
                        0,
                      ),
                      wins: formatCount(historyFor(s.from)!.wins),
                      count: formatCount(historyFor(s.from)!.count),
                    })}
                    <span className="block text-xs text-muted">
                      {fillTemplate(c.bandLive, { wins: String(s.wins), count: String(s.count) })}
                    </span>
                  </>
                ) : (
                  fillTemplate(c.bandFew, { wins: String(s.wins), count: String(s.count) })
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {shown.some((s) => s.count < MIN_SAMPLE && historyFor(s.from)) ? (
        <p className="mt-2 text-xs text-subtle">{c.reliabilityHistoryNote}</p>
      ) : null}
      {count > 0 && roi !== null ? (
        <p className="mt-3 text-sm">
          {fillTemplate(c.pastValueSummary, {
            wins: String(wins),
            count: String(count),
            roi: `${roi >= 0 ? "+" : "−"}${formatPercent(Math.abs(roi), 0)}`,
          })}
        </p>
      ) : null}
    </details>
  );
}

/**
 * Giocate singole più probabili, partita per partita e per campionato. Le multiple stanno
 * solo nella pagina Schedine (ADR 0062): qui niente schedine ripetute.
 */
async function CertaintiesContent() {
  const c = getMessages().certainties;
  const [upcoming, competitions] = await Promise.all([loadUpcoming(), listCompetitions()]);
  const picks = selectPicks(upcoming.rows, DEFAULT_THRESHOLD, upcoming.market);
  const matches = groupByMatch(picks);
  const prices = upcoming.prices;

  return (
    <>
      <h2 className="mb-3 text-lg font-semibold">
        {fillTemplate(c.matchesTitle, { count: String(matches.length) })}
      </h2>
      {matches.length === 0 ? (
        <EmptyState>{c.empty}</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {groupByCompetition(
            matches,
            competitions.map((x) => x.id),
          ).map((group, index) => (
            <details
              key={group.competitionId ?? "altro"}
              open={index === 0}
              className="group rounded-[var(--radius-card)] border border-border bg-surface/40 p-3 sm:p-4"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 transition-transform group-open:rotate-180"
                />
                {competitions.find((x) => x.id === group.competitionId)?.name ?? c.otherCompetition}
                <span className="font-normal normal-case tracking-normal text-subtle">
                  {group.matches.length === 1
                    ? c.competitionCountOne
                    : fillTemplate(c.competitionCount, { count: String(group.matches.length) })}
                </span>
              </summary>
              <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.matches.map((match) => (
                  <li key={match.matchId}>
                    <Card className="h-full">
                      <Link
                        href={`/match-center/${match.matchId}`}
                        className="block font-medium hover:underline"
                      >
                        {match.home} – {match.away}
                      </Link>
                      <p className="text-xs text-muted">{formatDateTime(match.kickoffAt)}</p>
                      <ul className="mt-2 divide-y divide-border">
                        {match.picks.map((p) => (
                          <PickRow
                            key={`${p.market}|${p.line ?? ""}|${p.selection}`}
                            pick={p}
                            prices={prices}
                          />
                        ))}
                      </ul>
                    </Card>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

/** Verifica sulle partite già giocate: la lettura più pesante, caricata per ultima. */
async function ReliabilitySection() {
  const [verification, historyCheck] = await Promise.all([
    loadVerification(),
    getActiveHistoryCheck().catch(() => null),
  ]);
  const history = new Map(
    (historyCheck?.bands ?? []).map((b) => [b.from, { wins: b.wins, count: b.count }]),
  );
  const stats = bandStats(verification.rows, verification.results, verification.market);
  const pastValue = pastValueMultiples(
    verification.rows,
    verification.results,
    DEFAULT_THRESHOLD,
    (p) => italianPriceFor(verification.prices, p)?.price ?? null,
    verification.market,
  );
  return (
    <Reliability
      stats={stats}
      wins={pastValue.filter((x) => x.won).length}
      count={pastValue.length}
      roi={flatReturn(pastValue)}
      history={history}
    />
  );
}

export default async function CertaintiesPage() {
  await requireUser();
  const m = getMessages();
  const c = m.certainties;

  if (!(await hasActiveModel())) {
    return (
      <>
        <PageHeader title={c.title} description={c.description} />
        <Alert>{m.predictions.emptyReasons.NO_ACTIVE_MODEL}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        }
      >
        <CertaintiesContent />
      </Suspense>
      <div className="mt-6">
        <Suspense fallback={null}>
          <ReliabilitySection />
        </Suspense>
      </div>
    </>
  );
}
