import type { Metadata } from "next";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { loadVerification } from "@/lib/certainties/load";
import { BANDS } from "@/lib/certainties/logic";
import { VERIFY_DAYS } from "@/lib/certainties/queries";
import { groupStats, MIN_SAMPLE, totalStat, type GroupStat } from "@/lib/certainties/reliability";
import { listCompetitions } from "@/lib/football/queries";
import { getMessages } from "@/lib/i18n";
import { fillTemplate, formatPercent } from "@/lib/odds/format";
import { formatLine } from "@/lib/predictions/format";
import { splitMarketKey, toGroupStat, type HistoryCheck } from "@/lib/predictions/history";
import { getActiveHistoryCheck } from "@/lib/predictions/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Affidabilità" };

/** Soglia minima delle giocate controllate: la stessa da cui partono le Certezze. */
const MIN_PROBABILITY = BANDS[0]![0];

/** Barra: quante sono uscite (piena) rispetto a quanto erano date (tacca). Decorativa. */
function OutcomeBar({ stat }: { stat: GroupStat }) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%`;
  return (
    <span aria-hidden="true" className="relative mt-1.5 block h-1.5 rounded-full bg-border">
      <span
        className={cn(
          "block h-full rounded-full",
          stat.observed >= stat.predicted ? "bg-positive" : "bg-warning",
        )}
        style={{ width: pct(stat.observed) }}
      />
      <span
        className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-fg"
        style={{ left: pct(stat.predicted) }}
      />
    </span>
  );
}

function StatList({
  stats,
  label,
}: {
  stats: readonly GroupStat[];
  label: (key: string) => string;
}) {
  const m = getMessages().reliability;
  return (
    <ul className="mt-2 divide-y divide-border">
      {stats.map((s) => (
        <li key={s.key} className="py-2.5 text-sm">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-medium">{label(s.key)}</span>
            <span className="shrink-0 tabular-nums">
              {s.count < MIN_SAMPLE
                ? fillTemplate(m.few, { wins: s.wins, count: s.count })
                : fillTemplate(m.result, {
                    observed: formatPercent(s.observed, 0),
                    wins: s.wins,
                    count: s.count,
                  })}
            </span>
          </span>
          {s.count >= MIN_SAMPLE ? (
            <>
              <OutcomeBar stat={s} />
              <span className="mt-1 block text-xs text-muted">
                {fillTemplate(m.expected, { predicted: formatPercent(s.predicted, 0) })}
              </span>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Riquadro numerico in cima alla verifica storica. */
function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

/** Fasce di probabilità: uscite (barra) contro probabilità data (tacca). */
function CalibrationCard({ history }: { history: HistoryCheck }) {
  const r = getMessages().reliability;
  const bands = history.bands.filter((b) => b.count > 0);
  return (
    <Card>
      <CardTitle>{r.calibrationTitle}</CardTitle>
      <p className="mt-1 text-sm text-muted">{r.calibrationIntro}</p>
      <ul className="mt-3 divide-y divide-border">
        {bands.map((b) => {
          const stat = toGroupStat(String(b.from), b);
          return (
            <li key={b.from} className="py-2.5 text-sm">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {b.to >= 1
                    ? fillTemplate(r.bandLast, { from: formatPercent(b.from, 0) })
                    : fillTemplate(r.band, {
                        from: formatPercent(b.from, 0),
                        to: formatPercent(b.to, 0),
                      })}
                </span>
                <span className="shrink-0 tabular-nums">
                  {fillTemplate(r.result, {
                    observed: formatPercent(stat.observed, 0),
                    wins: formatCount(b.wins),
                    count: formatCount(b.count),
                  })}
                </span>
              </span>
              <OutcomeBar stat={stat} />
              <span className="mt-1 block text-xs text-muted">
                {fillTemplate(r.expected, { predicted: formatPercent(stat.predicted, 0) })}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Uscite delle giocate dal 70%, una barra per settimana. */
function WeeklyCard({ history }: { history: HistoryCheck }) {
  const r = getMessages().reliability;
  const weeks = history.weeks.slice(-16);
  if (weeks.length === 0) return null;
  const label = (iso: string) =>
    new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(
      new Date(`${iso}T12:00:00Z`),
    );
  return (
    <Card>
      <CardTitle>{r.weeklyTitle}</CardTitle>
      <p className="mt-1 text-sm text-muted">{r.weeklyIntro}</p>
      <ul className="mt-4 flex h-40 items-end gap-1 sm:gap-1.5" aria-label={r.weeklyTitle}>
        {weeks.map((w) => {
          const rate = w.count ? w.wins / w.count : 0;
          const predicted = w.count ? w.predicted / w.count : 0;
          return (
            <li key={w.week} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
              <span className="relative w-full flex-1 overflow-hidden rounded-sm bg-surface-2">
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 rounded-sm",
                    rate >= predicted ? "bg-positive" : "bg-warning",
                  )}
                  style={{ height: `${Math.max(rate * 100, 3)}%` }}
                />
                <span
                  className="absolute inset-x-0 h-0.5 bg-fg/70"
                  style={{ bottom: `${predicted * 100}%` }}
                />
              </span>
              <span className="hidden text-[10px] text-subtle sm:block">{label(w.week)}</span>
              <span className="sr-only">
                {fillTemplate(r.week, { week: label(w.week), wins: w.wins, count: w.count })}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-subtle">{r.weeklyNote}</p>
    </Card>
  );
}

const formatCount = (n: number) => new Intl.NumberFormat("it-IT").format(n);

/**
 * Quanto ci si può fidare: delle giocate che PREDICTRA dava almeno al 70% prima della
 * partita, quante sono uscite, in totale, per tipo di giocata e per campionato. Stessi dati
 * e stesse regole della verifica delle Certezze; nessun numero stimato.
 */
export default async function ReliabilityPage() {
  await requireUser();
  const m = getMessages();
  const r = m.reliability;
  const [verification, competitions, history] = await Promise.all([
    loadVerification(),
    listCompetitions(),
    getActiveHistoryCheck().catch(() => null),
  ]);
  const stats = (keyOf: Parameters<typeof groupStats>[2]) =>
    groupStats(
      verification.rows,
      verification.results,
      keyOf,
      MIN_PROBABILITY,
      verification.market,
    );

  const byMarket = stats((row) =>
    row.line === null ? row.market : `${row.market}|${Number(row.line)}`,
  );
  const byCompetition = stats((row) => String(row.competition_id));
  const total = totalStat(byMarket);

  const marketLabel = (key: string) => {
    const [market, line] = key.split("|") as [keyof typeof m.predictions.markets, string?];
    const name = m.predictions.markets[market] ?? market;
    return line === undefined ? name : `${name} ${formatLine(Number(line), market)}`;
  };
  const competitionName = new Map(competitions.map((c) => [String(c.id), c.name]));
  const basis = fillTemplate(r.basis, {
    days: VERIFY_DAYS,
    min: formatPercent(MIN_PROBABILITY, 0),
  });

  const dateFmt = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(
          new Date(iso),
        )
      : "–";
  const hs = history
    ? {
        favourite: toGroupStat("f", history.favourite),
        picks: toGroupStat("p", history.picks),
        exact: toGroupStat("e", history.exactScore),
      }
    : null;
  const historyMarkets = history
    ? history.markets
        .map((t) => {
          const { market, line } = splitMarketKey(t.market);
          return toGroupStat(line === null ? market : `${market}|${line}`, t);
        })
        .sort((a, b) => b.count - a.count)
    : [];
  const historyCompetitions = history
    ? history.competitions
        .map((t) => toGroupStat(String(t.competitionId), t))
        .sort((a, b) => b.observed - a.observed)
    : [];
  const historySeasons = history ? history.seasons.map((t) => toGroupStat(t.season, t)) : [];

  return (
    <>
      <PageHeader title={r.title} description={r.description} />

      {history && hs ? (
        <section aria-labelledby="storico" className="mb-8">
          <h2 id="storico" className="text-lg font-semibold">
            {r.historyTitle}
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            {fillTemplate(r.historyIntro, {
              matches: formatCount(history.matches),
              from: dateFmt(history.windowStart),
              to: dateFmt(history.windowEnd),
            })}
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={r.historyMatches} value={formatCount(history.matches)} />
            <Kpi
              label={r.historyPicks}
              value={formatPercent(hs.picks.observed, 0)}
              hint={fillTemplate(r.historyPicksHint, {
                wins: formatCount(hs.picks.wins),
                count: formatCount(hs.picks.count),
                predicted: formatPercent(hs.picks.predicted, 0),
              })}
            />
            <Kpi
              label={r.historyFavourite}
              value={formatPercent(hs.favourite.observed, 0)}
              hint={fillTemplate(r.historyFavouriteHint, {
                predicted: formatPercent(hs.favourite.predicted, 0),
              })}
            />
            <Kpi
              label={r.historyExact}
              value={formatPercent(hs.exact.observed, 0)}
              hint={fillTemplate(r.historyExactHint, {
                predicted: formatPercent(hs.exact.predicted, 0),
              })}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CalibrationCard history={history} />
            <WeeklyCard history={history} />
            <Card>
              <CardTitle>{r.byMarket}</CardTitle>
              <StatList stats={historyMarkets} label={marketLabel} />
            </Card>
            <Card>
              <CardTitle>{r.byCompetition}</CardTitle>
              <StatList
                stats={historyCompetitions}
                label={(key) => competitionName.get(key) ?? key}
              />
            </Card>
            <Card>
              <CardTitle>{r.bySeason}</CardTitle>
              <StatList stats={historySeasons} label={(key) => key} />
            </Card>
          </div>
          <p className="mt-3 text-xs text-subtle">
            {fillTemplate(r.historyNote, { date: dateFmt(history.checkedAt) })}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="live">
        <h2 id="live" className="text-lg font-semibold">
          {r.liveTitle}
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted">{r.liveIntro}</p>
        {total === null ? (
          <EmptyState>{r.empty}</EmptyState>
        ) : (
          <>
            <Card>
              <CardTitle>{r.overall}</CardTitle>
              <p className="mt-3 text-3xl font-semibold tabular-nums">
                {formatPercent(total.observed, 0)}
              </p>
              <p className="mt-1 text-sm">
                {fillTemplate(r.overallDetail, {
                  wins: total.wins,
                  count: total.count,
                  predicted: formatPercent(total.predicted, 0),
                })}
              </p>
              <OutcomeBar stat={total} />
              <p className="mt-3 text-xs text-muted">{basis}</p>
            </Card>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardTitle>{r.byMarket}</CardTitle>
                <StatList stats={byMarket} label={marketLabel} />
              </Card>
              <Card>
                <CardTitle>{r.byCompetition}</CardTitle>
                <StatList stats={byCompetition} label={(key) => competitionName.get(key) ?? key} />
              </Card>
            </div>
            <p className="mt-4 text-xs text-subtle">{r.note}</p>
          </>
        )}
      </section>
    </>
  );
}
