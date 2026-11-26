import type { Metadata } from "next";
import Link from "next/link";
import { averageClv, computeMetrics, profitCurve } from "@predictra/bankroll";
import { BANKROLL_KINDS, type BankrollKind, type BetRow } from "@predictra/shared-types";
import { ProfitCurve } from "@/components/bankroll/profit-curve";
import { formatEuro, KindBadge, SignedEuro, Stat } from "@/components/bankroll/shared";
import { FilterForm } from "@/components/ui/filter-form";
import {
  Alert,
  Button,
  Card,
  CardTitle,
  Field,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { byKey, byMonth, extremes, type BreakdownRow } from "@/lib/bankroll/breakdown";
import { parsePeriod, PERIODS, timeWindows } from "@/lib/bankroll/period";
import { listBankrolls, listBets, listMovements } from "@/lib/bankroll/queries";
import { settleOpenBets } from "@/lib/bankroll/settle";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { formatPercent } from "@/lib/predictions/format";

export const metadata: Metadata = { title: getMessages().pageTitles.performance };

const odds = (v: number | null) => (v === null ? "–" : Number(v).toFixed(2).replace(".", ","));

/** Tabellina di un raggruppamento: voce, giocate vinte su chiuse, profitto e resa. */
function BreakdownList({ title, rows }: { title: string; rows: readonly BreakdownRow[] }) {
  const t = getMessages().tracker;
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-subtle">{title}</h4>
      <ul className="mt-1 divide-y divide-border">
        {rows.slice(0, 8).map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{r.key}</span>
              <span className="block text-xs text-muted">
                {fillTemplate(t.breakdownWins, { wins: r.wins, bets: r.bets })}
                {r.yield !== null ? ` · ${t.yield} ${formatPercent(r.yield, 0)}` : ""}
              </span>
            </span>
            <span className="shrink-0 font-mono font-semibold">
              <SignedEuro value={r.profit} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Come sto andando": per mese, per tipo di giocata, per sito, più la migliore e la peggiore. */
function HowAmIDoing({ bets }: { bets: readonly BetRow[] }) {
  const t = getMessages().tracker;
  const months = byMonth(bets).map((r) => ({ ...r, key: formatMonth(r.key) }));
  if (months.length === 0) return null;
  const x = extremes(bets);
  return (
    <details open className="mt-4 border-t border-border pt-3">
      <summary className="cursor-pointer text-sm font-medium hover:text-positive-strong">
        {t.howAmIDoing}
      </summary>
      <BreakdownList title={t.byMonth} rows={months} />
      <BreakdownList title={t.byMarket} rows={byKey(bets, (b) => b.market, t.notSet)} />
      <BreakdownList title={t.bySite} rows={byKey(bets, (b) => b.bookmaker, t.notSet)} />
      {x && x.best !== x.worst ? (
        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {(
            [
              [t.bestBet, x.best],
              [t.worstBet, x.worst],
            ] as const
          ).map(([label, bet]) => (
            <div key={label} className="rounded-xl bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{bet.description ?? bet.market}</span>
                <span className="shrink-0 font-mono font-semibold">
                  <SignedEuro value={bet.profit ?? 0} />
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </details>
  );
}

/** "2026-11" → "novembre 2026". */
function formatMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 15)),
  );
}

/**
 * Andamento (sezione «Soldi»): come stanno andando le giocate registrate, per tipo di
 * bankroll, con il grafico del profitto e il dettaglio per mese, tipo di giocata e sito.
 * Solo dati dell'utente (RLS): nessun altro li vede.
 */
export default async function PerformancePage({ searchParams }: PageProps<"/performance">) {
  await requireUser();
  const t = getMessages().tracker;
  const b = getMessages().bankroll;
  const params = await searchParams;
  const period = parsePeriod(params.p);
  const { since } = timeWindows(period);
  await settleOpenBets();
  const [bankrolls, allBets, movements] = await Promise.all([
    listBankrolls(),
    listBets(),
    listMovements(),
  ]);
  const bets = since ? allBets.filter((x) => new Date(x.placed_at) >= since) : allBets;
  const kindOf = new Map(bankrolls.map((x) => [x.bankroll_id, x.kind]));

  const metricsFor = (kind: BankrollKind) => {
    const kindBets = bets.filter((x) => x.bankroll_kind === kind);
    const kindMovements = movements.filter((mv) => kindOf.get(mv.bankroll_id) === kind);
    return {
      bets: kindBets,
      metrics: computeMetrics(kindBets, kindMovements),
      clv: averageClv(kindBets),
      curve: profitCurve(kindBets),
    };
  };

  return (
    <>
      <PageHeader title={t.performanceTitle} description={t.performanceDescription} />
      {bankrolls.length === 0 ? (
        <Alert tone="warning">
          {t.needBankroll}{" "}
          <Link href="/bankroll" className="underline">
            {b.title}
          </Link>
        </Alert>
      ) : (
        <>
          <FilterForm className="mb-4 flex flex-wrap items-end gap-3">
            <Field label={t.period} htmlFor="p">
              <Select id="p" name="p" defaultValue={period} className="w-48">
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t.periods[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              {t.apply}
            </Button>
          </FilterForm>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {BANKROLL_KINDS.filter((kind) => bankrolls.some((x) => x.kind === kind)).map((kind) => {
              const { metrics, clv, curve, bets: kindBets } = metricsFor(kind);
              return (
                <Card key={kind}>
                  <div className="flex items-center justify-between">
                    <CardTitle>{b.kinds[kind]}</CardTitle>
                    <KindBadge kind={kind} />
                  </div>
                  {/* In vista i quattro numeri che contano; gli altri a richiesta. */}
                  <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label={t.profit}>
                      <SignedEuro value={metrics.profit} />
                    </Stat>
                    <Stat label={t.yield}>{formatPercent(metrics.yield)}</Stat>
                    <Stat label={t.hitRate}>{formatPercent(metrics.hitRate)}</Stat>
                    <Stat label={t.bets}>
                      {metrics.settledBets} / {metrics.bets}
                    </Stat>
                  </dl>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-xs text-muted hover:text-fg">
                      {t.moreMetrics}
                    </summary>
                    <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <Stat label={t.staked}>{formatEuro(metrics.staked)}</Stat>
                      <Stat label={t.roi}>{formatPercent(metrics.roi)}</Stat>
                      <Stat label={t.averageOdds}>{odds(metrics.averageOdds)}</Stat>
                      <Stat label={t.maxDrawdown}>
                        {formatEuro(metrics.maxDrawdown)}
                        {metrics.maxDrawdownPct !== null
                          ? ` (${formatPercent(metrics.maxDrawdownPct)})`
                          : ""}
                      </Stat>
                      <Stat label={t.clv}>{formatPercent(clv)}</Stat>
                    </dl>
                    <p className="mt-2 text-xs text-muted">{t.metricsHelp}</p>
                  </details>
                  <ProfitCurve points={curve} label={b.kinds[kind]} />
                  <HowAmIDoing bets={kindBets} />
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
