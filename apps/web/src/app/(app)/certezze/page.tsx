import type { Metadata } from "next";
import Link from "next/link";
import { pickLabel } from "@/components/bet-builder/likely";
import { PickChip } from "@/components/certainties/pick-chip";
import { combinedItalianPrice, type ItalianPrice } from "@/lib/bet-builder/likely";
import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import {
  bandStats,
  buildMultiple,
  groupByMatch,
  MULTIPLE_TARGETS,
  type Pick,
  parseThreshold,
  selectPicks,
  THRESHOLDS,
  type BandStat,
} from "@/lib/certainties/logic";
import { loadUpcoming, loadVerification } from "@/lib/certainties/load";
import { VERIFY_DAYS } from "@/lib/certainties/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds } from "@/lib/odds/format";
import { formatFairOdds, formatPercent } from "@/lib/predictions/format";
import { hasActiveModel } from "@/lib/predictions/queries";

export const metadata: Metadata = { title: "Certezze" };

/** Sotto questo numero di selezioni la frequenza osservata è troppo ballerina. */
const MIN_SAMPLE = 30;

function bandTone(stat: BandStat): "positive" | "warning" | "negative" | "neutral" {
  if (stat.observed === null || stat.predicted === null || stat.count < MIN_SAMPLE) {
    return "neutral";
  }
  const gap = stat.observed - stat.predicted;
  if (gap >= -0.03) return "positive";
  if (gap >= -0.08) return "warning";
  return "negative";
}

function Verification({ stats }: { stats: BandStat[] }) {
  const c = getMessages().certainties;
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  return (
    <Card>
      <CardTitle>{c.verifyTitle}</CardTitle>
      <p className="mt-1 text-sm text-muted">
        {fillTemplate(c.verifyDescription, { days: String(VERIFY_DAYS) })}
      </p>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted">{c.verifyEmpty}</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-5">
          {stats.map((s) => (
            <li key={s.from} className="rounded-md border border-border p-3 text-sm">
              <p className="text-xs text-muted">
                {formatPercent(s.from, 0)}–{formatPercent(s.to, 0)}
              </p>
              <p className="mt-1 text-lg font-semibold">
                {s.observed === null ? "–" : formatPercent(s.observed)}
              </p>
              <p className="text-xs text-muted">
                {fillTemplate(c.verifyCount, { wins: String(s.wins), count: String(s.count) })}
              </p>
              {s.count > 0 ? (
                <Badge tone={bandTone(s)} className="mt-2">
                  {s.count < MIN_SAMPLE
                    ? c.smallSample
                    : fillTemplate(c.expected, { value: formatPercent(s.predicted) })}
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Multiples({
  picks,
  prices,
}: {
  picks: readonly Pick[];
  prices: ReadonlyMap<string, ItalianPrice>;
}) {
  const c = getMessages().certainties;
  const multiples = MULTIPLE_TARGETS.map((t) => ({ target: t, multiple: buildMultiple(picks, t) }));
  if (multiples.every((x) => x.multiple === null)) return null;
  return (
    <Card>
      <CardTitle>{c.multiplesTitle}</CardTitle>
      <p className="mt-1 text-sm text-muted">{c.multiplesHint}</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {multiples.map(({ target, multiple }) =>
          multiple ? (
            <div key={target} className="rounded-md border border-border p-3">
              <p className="text-sm font-medium">
                {fillTemplate(c.multipleTitle, {
                  target: formatPercent(target, 0),
                  legs: String(multiple.picks.length),
                })}
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {multiple.picks.map((p) => (
                  <li key={p.matchId} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <Link href={`/match-center/${p.matchId}`} className="hover:underline">
                        {p.home} – {p.away}
                      </Link>{" "}
                      <span className="text-muted">· {pickLabel(p)}</span>
                    </span>
                    <span className="font-mono">{formatPercent(p.probability, 0)}</span>
                  </li>
                ))}
              </ul>
              <MultipleTotals
                picks={multiple.picks}
                probability={multiple.probability}
                prices={prices}
              />
            </div>
          ) : null,
        )}
      </div>
    </Card>
  );
}

function MultipleTotals({
  picks,
  probability,
  prices,
}: {
  picks: readonly Pick[];
  probability: number;
  prices: ReadonlyMap<string, ItalianPrice>;
}) {
  const c = getMessages().certainties;
  const price = combinedItalianPrice(prices, picks);
  return (
    <p className="mt-2 border-t border-border pt-2 text-sm">
      {fillTemplate(c.multipleProbability, { value: formatPercent(probability) })}{" "}
      <span className="text-xs text-muted">
        ({c.fairOdds} {formatFairOdds(probability)})
      </span>
      {price !== null ? (
        <span className="block text-xs">
          {fillTemplate(c.multiplePrice, { price: formatOdds(price) })}{" "}
          <Badge tone={probability * price >= 1 ? "positive" : "neutral"}>
            {probability * price >= 1
              ? fillTemplate(c.worth, { value: formatPercent(probability * price - 1) })
              : c.notWorth}
          </Badge>
        </span>
      ) : (
        <span className="block text-xs text-muted">{c.multipleNoPrice}</span>
      )}
    </p>
  );
}

export default async function CertaintiesPage({ searchParams }: PageProps<"/certezze">) {
  await requireUser();
  const m = getMessages();
  const c = m.certainties;
  const threshold = parseThreshold((await searchParams).soglia);

  const active = await hasActiveModel();
  if (!active) {
    return (
      <>
        <PageHeader title={c.title} description={c.description} />
        <Alert>{m.predictions.emptyReasons.NO_ACTIVE_MODEL}</Alert>
      </>
    );
  }

  const [upcoming, verification] = await Promise.all([loadUpcoming(), loadVerification()]);
  const matches = groupByMatch(selectPicks(upcoming.rows, threshold, upcoming.market));
  const prices = upcoming.prices;
  const stats = bandStats(verification.rows, verification.results, verification.market);

  return (
    <>
      <PageHeader title={c.title} description={c.description} />

      <nav aria-label={c.thresholdLabel} className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{c.thresholdLabel}</span>
        {THRESHOLDS.map((t) => {
          const current = Math.abs(t - threshold) < 1e-9;
          return (
            <Link
              key={t}
              href={`/certezze?soglia=${Math.round(t * 100)}`}
              aria-current={current ? "page" : undefined}
              className={`rounded-lg border px-3 py-1.5 ${
                current
                  ? "border-positive/40 bg-positive-soft text-positive-strong"
                  : "border-border text-muted hover:text-fg"
              }`}
            >
              {fillTemplate(c.atLeast, { value: formatPercent(t, 0) })}
            </Link>
          );
        })}
      </nav>

      <Verification stats={stats} />

      <Multiples picks={matches.flatMap((g) => g.picks)} prices={prices} />

      <Card>
        <CardTitle>
          {fillTemplate(c.upcomingTitle, {
            count: String(matches.length),
            value: formatPercent(threshold, 0),
          })}
        </CardTitle>
        <p className="mt-1 text-sm text-muted">{c.upcomingHint}</p>
        {matches.length === 0 ? (
          <EmptyState className="mt-3">{c.empty}</EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {matches.map((match) => (
              <li key={match.matchId} className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-4">
                <div className="sm:w-64 sm:shrink-0">
                  <Link
                    href={`/match-center/${match.matchId}`}
                    className="font-medium hover:underline"
                  >
                    {match.home} – {match.away}
                  </Link>
                  <p className="text-xs text-muted">{formatDateTime(match.kickoffAt)}</p>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {match.picks.map((p) => (
                    <PickChip
                      key={`${p.market}|${p.line ?? ""}|${p.selection}`}
                      pick={p}
                      prices={prices}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
