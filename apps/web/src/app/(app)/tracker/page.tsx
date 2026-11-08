import type { Metadata } from "next";
import Link from "next/link";
import {
  averageClv,
  checkLimits,
  computeMetrics,
  flatStake,
  lossSince,
  profitCurve,
} from "@predictra/bankroll";
import { BANKROLL_KINDS, BET_STATUSES, type BankrollKind } from "@predictra/shared-types";
import { ProfitCurve } from "@/components/bankroll/profit-curve";
import { formatEuro, KindBadge, Stat, Th } from "@/components/bankroll/shared";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import {
  Alert,
  Badge,
  Card,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { parsePeriod, PERIODS, timeWindows } from "@/lib/bankroll/period";
import { listBankrolls, listBets, listLimits, listMovements } from "@/lib/bankroll/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { formatPercent } from "@/lib/predictions/format";
import { addBet, deleteBet, settleBet } from "./actions";

export const metadata: Metadata = { title: "Tracker" };

const odds = (v: number | null) => (v === null ? "–" : Number(v).toFixed(2).replace(".", ","));

export default async function TrackerPage({ searchParams }: PageProps<"/tracker">) {
  await requireUser();
  const t = getMessages().tracker;
  const b = getMessages().bankroll;
  const params = await searchParams;
  const period = parsePeriod(params.p);
  const { since, dayAgo, weekAgo } = timeWindows(period);

  const [bankrolls, allBets, movements, limits] = await Promise.all([
    listBankrolls(),
    listBets(),
    listMovements(),
    listLimits(),
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
      <PageHeader title={t.title} description={t.description} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t.period} htmlFor="p">
          <Select id="p" name="p" defaultValue={period} className="w-48">
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t.periods[p]}
              </option>
            ))}
          </Select>
        </Field>
        <button
          type="submit"
          className="h-10 rounded-lg border border-border-strong bg-surface-2 px-4 text-sm hover:bg-border"
        >
          {t.apply}
        </button>
      </form>

      <h2 className="mb-3 text-lg font-semibold">{t.metrics}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {BANKROLL_KINDS.map((kind) => {
          const { metrics, clv, curve } = metricsFor(kind);
          return (
            <Card key={kind}>
              <div className="flex items-center justify-between">
                <CardTitle>{b.kinds[kind]}</CardTitle>
                <KindBadge kind={kind} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label={t.bets}>
                  {metrics.settledBets} / {metrics.bets}
                </Stat>
                <Stat label={t.profit}>{formatEuro(metrics.profit)}</Stat>
                <Stat label={t.staked}>{formatEuro(metrics.staked)}</Stat>
                <Stat label={t.yield}>{formatPercent(metrics.yield)}</Stat>
                <Stat label={t.roi}>{formatPercent(metrics.roi)}</Stat>
                <Stat label={t.hitRate}>{formatPercent(metrics.hitRate)}</Stat>
                <Stat label={t.averageOdds}>{odds(metrics.averageOdds)}</Stat>
                <Stat label={t.maxDrawdown}>
                  {formatEuro(metrics.maxDrawdown)}
                  {metrics.maxDrawdownPct !== null
                    ? ` (${formatPercent(metrics.maxDrawdownPct)})`
                    : ""}
                </Stat>
                <Stat label={t.clv}>{formatPercent(clv)}</Stat>
              </dl>
              <ProfitCurve points={curve} label={b.kinds[kind]} />
            </Card>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">{t.metricsHelp}</p>

      {bankrolls.length === 0 ? (
        <Alert className="mt-6" tone="warning">
          {t.needBankroll}{" "}
          <Link href="/bankroll" className="underline">
            {b.title}
          </Link>
        </Alert>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardTitle>{t.addBet}</CardTitle>
            <ActionForm action={addBet} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={t.bankroll} htmlFor="bet-bankroll">
                <Select id="bet-bankroll" name="bankrollId" required>
                  {bankrolls.map((x) => (
                    <option key={x.bankroll_id} value={x.bankroll_id}>
                      {x.name} ({b.kinds[x.kind]})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.event} htmlFor="bet-event">
                <Input id="bet-event" name="description" maxLength={200} required />
              </Field>
              <Field label={t.market} htmlFor="bet-market">
                <Input id="bet-market" name="market" maxLength={40} required placeholder="1X2" />
              </Field>
              <Field label={t.selection} htmlFor="bet-selection">
                <Input
                  id="bet-selection"
                  name="selection"
                  maxLength={40}
                  required
                  placeholder="1"
                />
              </Field>
              <Field label={t.odds} htmlFor="bet-odds">
                <Input id="bet-odds" name="odds" inputMode="decimal" required />
              </Field>
              <Field label={t.stake} htmlFor="bet-stake">
                <Input id="bet-stake" name="stake" inputMode="decimal" required />
              </Field>
              <Field label={t.line} htmlFor="bet-line">
                <Input id="bet-line" name="line" inputMode="decimal" />
              </Field>
              <Field label={t.bookmaker} htmlFor="bet-bookmaker">
                <Input id="bet-bookmaker" name="bookmaker" maxLength={60} />
              </Field>
              <Field label={t.placedAt} htmlFor="bet-date">
                <Input id="bet-date" name="placedAt" type="datetime-local" />
              </Field>
              <Field label={t.closingOdds} htmlFor="bet-closing">
                <Input id="bet-closing" name="closingOdds" inputMode="decimal" />
              </Field>
              <SubmitButton className="sm:col-span-2">{t.saveBet}</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <CardTitle>{t.suggestions}</CardTitle>
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              {bankrolls.map((x) => {
                const own = allBets.filter((bet) => bet.bankroll_id === x.bankroll_id);
                const lim = limits.find((l) => l.bankroll_id === x.bankroll_id) ?? null;
                const reached = checkLimits({
                  stake: 0,
                  limits: lim,
                  openBets: x.open_bets,
                  lossLast24h: lossSince(own, dayAgo),
                  lossLast7d: lossSince(own, weekAgo),
                });
                return (
                  <li key={x.bankroll_id} className="border-b border-border pb-3 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{x.name}</span>
                      <KindBadge kind={x.kind} />
                    </div>
                    <p className="mt-1 text-muted">
                      {t.flatSuggestion}:{" "}
                      <span className="font-mono text-fg">
                        {formatEuro(flatStake(Number(x.available), Number(x.flat_stake_pct)))}
                      </span>
                    </p>
                    {reached.length > 0 ? (
                      <Badge tone="negative" className="mt-1">
                        {t.limitReached}: {reached.map((r) => t.limitNames[r]).join(", ")}
                      </Badge>
                    ) : (
                      <p className="mt-1 text-xs text-muted">{t.noLimitReached}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted">{t.suggestionsHint}</p>
          </Card>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">{t.bets}</h2>
      <Card className="overflow-x-auto p-0">
        {bets.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.noBets}</p>
        ) : (
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{t.placedAt}</Th>
                <Th>{t.event}</Th>
                <Th>{t.bankroll}</Th>
                <Th className="text-right">{t.odds}</Th>
                <Th className="text-right">{t.stake}</Th>
                <Th>{t.status}</Th>
                <Th className="text-right">{t.profit}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {bets.map((bet) => (
                <tr key={bet.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-3 text-muted">
                    {formatDateTime(bet.placed_at)}
                  </td>
                  <td className="px-3 py-3">
                    {bet.description ?? "—"}
                    <span className="block text-xs text-muted">
                      {bet.market} · {bet.selection}
                      {bet.line !== null ? ` · ${bet.line}` : ""}
                      {bet.bookmaker ? ` · ${bet.bookmaker}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block">{bet.bankroll_name}</span>
                    <KindBadge kind={bet.bankroll_kind} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{odds(bet.odds)}</td>
                  <td className="px-3 py-3 text-right font-mono">{formatEuro(bet.stake)}</td>
                  <td className="px-3 py-3">
                    <Badge
                      tone={
                        bet.status === "OPEN"
                          ? "neutral"
                          : Number(bet.profit) > 0
                            ? "positive"
                            : Number(bet.profit) < 0
                              ? "negative"
                              : "warning"
                      }
                    >
                      {t.statuses[bet.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{formatEuro(bet.profit)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-2">
                      {bet.status === "OPEN" ? (
                        <ActionForm
                          action={settleBet}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="betId" value={bet.id} />
                          <label className="sr-only" htmlFor={`st-${bet.id}`}>
                            {t.status}
                          </label>
                          <Select
                            id={`st-${bet.id}`}
                            name="status"
                            defaultValue="WON"
                            className="h-8 w-36 text-xs"
                          >
                            {BET_STATUSES.filter((s) => s !== "OPEN").map((s) => (
                              <option key={s} value={s}>
                                {t.statuses[s]}
                              </option>
                            ))}
                          </Select>
                          <label className="sr-only" htmlFor={`po-${bet.id}`}>
                            {t.cashOutAmount}
                          </label>
                          <Input
                            id={`po-${bet.id}`}
                            name="payout"
                            inputMode="decimal"
                            placeholder={t.cashOutAmount}
                            className="h-8 w-40 text-xs"
                          />
                          <SubmitButton variant="secondary" className="h-8 px-3 text-xs">
                            {t.settle}
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                      <ActionForm action={deleteBet} className="inline">
                        <input type="hidden" name="betId" value={bet.id} />
                        <SubmitButton variant="ghost" className="h-7 px-2 text-xs">
                          {t.deleteBet}
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="mt-8 text-xs text-subtle">{t.disclaimer}</p>
    </>
  );
}
