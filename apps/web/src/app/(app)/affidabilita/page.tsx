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
            <span className="shrink-0 font-mono">
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

/**
 * Quanto ci si può fidare: delle giocate che PREDICTRA dava almeno al 70% prima della
 * partita, quante sono uscite, in totale, per tipo di giocata e per campionato. Stessi dati
 * e stesse regole della verifica delle Certezze; nessun numero stimato.
 */
export default async function ReliabilityPage() {
  await requireUser();
  const m = getMessages();
  const r = m.reliability;
  const [verification, competitions] = await Promise.all([loadVerification(), listCompetitions()]);
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

  return (
    <>
      <PageHeader title={r.title} description={r.description} />
      {total === null ? (
        <EmptyState>{r.empty}</EmptyState>
      ) : (
        <>
          <Card>
            <CardTitle>{r.overall}</CardTitle>
            <p className="mt-3 font-mono text-3xl font-semibold">
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
    </>
  );
}
