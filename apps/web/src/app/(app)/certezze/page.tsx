import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { pickLabel } from "@/components/bet-builder/likely";
import { PickRow } from "@/components/certainties/pick-chip";
import {
  Alert,
  Card,
  CardSkeleton,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { combinedItalianPrice, italianPriceFor, type ItalianPrice } from "@/lib/bet-builder/likely";
import { requireUser } from "@/lib/auth/dal";
import { loadUpcoming, loadVerification } from "@/lib/certainties/load";
import {
  bandStats,
  buildMultiple,
  buildValueMultiple,
  DEFAULT_THRESHOLD,
  flatReturn,
  groupByMatch,
  MULTIPLE_TARGET,
  pastValueMultiples,
  selectPicks,
  type BandStat,
  type Pick,
} from "@/lib/certainties/logic";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds } from "@/lib/odds/format";
import { formatPercent } from "@/lib/predictions/format";
import { hasActiveModel } from "@/lib/predictions/queries";

export const metadata: Metadata = { title: "Certezze" };

/** Sotto questo numero di giocate la percentuale uscita è troppo ballerina. */
const MIN_SAMPLE = 30;

/** Multipla: elenco delle partite e, in fondo, probabilità e quota. */
function MultipleCard({
  title,
  picks,
  probability,
  prices,
}: {
  title: string;
  picks: readonly Pick[];
  probability: number;
  prices: ReadonlyMap<string, ItalianPrice>;
}) {
  const c = getMessages().certainties;
  const price = combinedItalianPrice(prices, picks);
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <ul className="mt-3 divide-y divide-border">
        {picks.map((p) => (
          <li key={p.matchId} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <Link href={`/match-center/${p.matchId}`} className="block truncate hover:underline">
                {p.home} – {p.away}
              </Link>
              <span className="block text-xs text-muted">{pickLabel(p)}</span>
            </span>
            <span className="font-mono">{formatPercent(p.probability, 0)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
        <span className="text-sm text-muted">{c.multipleWin}</span>
        <span className="font-mono text-lg font-semibold text-positive-strong">
          {formatPercent(probability, 0)}
        </span>
      </p>
      {price !== null ? (
        <p className="text-sm text-muted">
          {fillTemplate(c.multiplePrice, { price: formatOdds(price) })}
        </p>
      ) : null}
    </Card>
  );
}

/** Quante volte sono uscite le stesse giocate sulle partite già giocate. */
function Reliability({
  stats,
  wins,
  count,
  roi,
}: {
  stats: BandStat[];
  wins: number;
  count: number;
  roi: number | null;
}) {
  const c = getMessages().certainties;
  const shown = stats.filter((s) => s.count > 0);
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
              <span>
                {s.count < MIN_SAMPLE
                  ? fillTemplate(c.bandFew, { wins: String(s.wins), count: String(s.count) })
                  : fillTemplate(c.bandResult, {
                      observed: formatPercent(s.observed, 0),
                      wins: String(s.wins),
                      count: String(s.count),
                    })}
              </span>
            </li>
          ))}
        </ul>
      )}
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

/** Multiple e partite: la parte principale, caricata appena possibile. */
async function CertaintiesContent() {
  const c = getMessages().certainties;
  const upcoming = await loadUpcoming();
  const picks = selectPicks(upcoming.rows, DEFAULT_THRESHOLD, upcoming.market);
  const matches = groupByMatch(picks);
  const prices = upcoming.prices;
  const priceFor = (p: Pick) => italianPriceFor(prices, p)?.price ?? null;
  const safe = buildMultiple(picks, MULTIPLE_TARGET);
  const value = buildValueMultiple(picks, priceFor);

  return (
    <>
      {safe || value ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {safe ? (
            <MultipleCard
              title={fillTemplate(c.safeTitle, { legs: String(safe.picks.length) })}
              picks={safe.picks}
              probability={safe.probability}
              prices={prices}
            />
          ) : null}
          {value ? (
            <MultipleCard
              title={fillTemplate(c.valueTitle, { legs: String(value.picks.length) })}
              picks={value.picks}
              probability={value.probability}
              prices={prices}
            />
          ) : null}
        </div>
      ) : null}

      <h2 className="mb-3 text-lg font-semibold">
        {fillTemplate(c.matchesTitle, { count: String(matches.length) })}
      </h2>
      {matches.length === 0 ? (
        <EmptyState>{c.empty}</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((match) => (
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
      )}
    </>
  );
}

/** Verifica sulle partite già giocate: la lettura più pesante, caricata per ultima. */
async function ReliabilitySection() {
  const verification = await loadVerification();
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
