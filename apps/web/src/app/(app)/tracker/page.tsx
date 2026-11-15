import type { Metadata } from "next";
import Link from "next/link";
import {
  averageClv,
  checkLimits,
  computeMetrics,
  flatStake,
  lossSince,
  profitCurve,
  suggestStake,
} from "@predictra/bankroll";
import {
  BANKROLL_KINDS,
  BET_STATUSES,
  DEFAULT_BET_BUILDER_RULES,
  type BankrollKind,
} from "@predictra/shared-types";
import { ProfitCurve } from "@/components/bankroll/profit-curve";
import { formatEuro, KindBadge, SignedEuro, Stat, Th } from "@/components/bankroll/shared";
import { FilterForm } from "@/components/ui/filter-form";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { parsePeriod, PERIODS, timeWindows } from "@/lib/bankroll/period";
import { expectedValue, fairOdds, KELLY_SELECTIONS, parseKellyInput } from "@/lib/bankroll/kelly";
import {
  listBankrolls,
  listBets,
  getMarketConsensus,
  listKellyMatches,
  listLimits,
  listMovements,
} from "@/lib/bankroll/queries";
import { usedProbability } from "@/lib/bet-builder/market";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { formatPercent } from "@/lib/predictions/format";
import { addBet, deleteBet, settleBet } from "./actions";

export const metadata: Metadata = { title: "Giocate fatte" };

const odds = (v: number | null) => (v === null ? "–" : Number(v).toFixed(2).replace(".", ","));

/** Valori precompilati dal link "Registra" delle Certezze (`/tracker?add=1&d=…`). */
function parsePrefill(params: Record<string, string | string[] | undefined>) {
  const text = (key: string, max: number) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v)?.slice(0, max) ?? "";
  };
  const number = (key: string) => {
    const v = text(key, 12).replace(",", ".");
    return /^\d{1,4}(\.\d{1,3})?$/.test(v) ? v : "";
  };
  return {
    open: text("add", 1) === "1",
    description: text("d", 200),
    market: text("mk", 40),
    selection: text("sel", 40),
    odds: number("o"),
    line: number("ln"),
    bookmaker: text("bk", 60),
  };
}

export default async function TrackerPage({ searchParams }: PageProps<"/tracker">) {
  await requireUser();
  const t = getMessages().tracker;
  const b = getMessages().bankroll;
  const c = getMessages().common;
  const params = await searchParams;
  const period = parsePeriod(params.p);
  const prefill = parsePrefill(params);
  const { since, dayAgo, weekAgo } = timeWindows(period);

  const [bankrolls, allBets, movements, limits, kellyMatches] = await Promise.all([
    listBankrolls(),
    listBets(),
    listMovements(),
    listLimits(),
    listKellyMatches(),
  ]);
  const k = t.kelly;
  const kellyInput = parseKellyInput(params);
  const kellyMatch = kellyMatches.find((x) => x.matchId === kellyInput.matchId) ?? null;
  const modelProbability =
    kellyMatch && kellyInput.selection
      ? (kellyMatch.probabilities[kellyInput.selection] ?? null)
      : null;
  // ADR 0028: probabilità prudente = media tra modello e consenso di mercato.
  const consensus = kellyMatch ? await getMarketConsensus(kellyMatch.matchId) : {};
  const marketProbability = kellyInput.selection ? consensus[kellyInput.selection] : undefined;
  const kellyProbability =
    modelProbability === null
      ? null
      : usedProbability(
          modelProbability,
          marketProbability,
          DEFAULT_BET_BUILDER_RULES.market_weight ?? 0,
        );
  const kellyReady = kellyProbability !== null && kellyInput.odds !== null;
  const kellyAsked = params.km !== undefined || params.ko !== undefined;
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
            </Card>
          );
        })}
      </div>

      {bankrolls.length === 0 ? (
        <Alert className="mt-6" tone="warning">
          {t.needBankroll}{" "}
          <Link href="/bankroll" className="underline">
            {b.title}
          </Link>
        </Alert>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* Modulo chiuso finché non serve: la pagina resta corta. */}
          <details
            open={prefill.open}
            className="group self-start rounded-[var(--radius-card)] border border-border bg-surface p-5"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <CardTitle>{t.addBet}</CardTitle>
              <span className="rounded-lg bg-positive px-3 py-1.5 text-sm font-medium text-black group-open:hidden">
                {t.addBetOpen}
              </span>
            </summary>
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
                <Input
                  id="bet-event"
                  name="description"
                  maxLength={200}
                  required
                  defaultValue={prefill.description}
                />
              </Field>
              <Field label={t.market} htmlFor="bet-market">
                <Input
                  id="bet-market"
                  name="market"
                  maxLength={40}
                  required
                  placeholder="1X2"
                  defaultValue={prefill.market}
                />
              </Field>
              <Field label={t.selection} htmlFor="bet-selection">
                <Input
                  id="bet-selection"
                  name="selection"
                  maxLength={40}
                  required
                  placeholder="1"
                  defaultValue={prefill.selection}
                />
              </Field>
              <Field label={t.odds} htmlFor="bet-odds">
                <Input
                  id="bet-odds"
                  name="odds"
                  inputMode="decimal"
                  required
                  defaultValue={prefill.odds}
                />
              </Field>
              <Field label={t.stake} htmlFor="bet-stake">
                <Input id="bet-stake" name="stake" inputMode="decimal" required />
              </Field>
              <Field label={t.line} htmlFor="bet-line">
                <Input id="bet-line" name="line" inputMode="decimal" defaultValue={prefill.line} />
              </Field>
              <Field label={t.bookmaker} htmlFor="bet-bookmaker">
                <Input
                  id="bet-bookmaker"
                  name="bookmaker"
                  maxLength={60}
                  defaultValue={prefill.bookmaker}
                />
              </Field>
              <Field label={t.placedAt} htmlFor="bet-date">
                <Input id="bet-date" name="placedAt" type="datetime-local" />
              </Field>
              <Field label={t.closingOdds} htmlFor="bet-closing">
                <Input id="bet-closing" name="closingOdds" inputMode="decimal" />
              </Field>
              <SubmitButton className="sm:col-span-2">{t.saveBet}</SubmitButton>
            </ActionForm>
          </details>

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

      {bankrolls.length > 0 ? (
        <Card className="mt-4">
          <CardTitle>{k.title}</CardTitle>
          <details className="mt-1 text-sm text-muted">
            <summary className="cursor-pointer text-xs hover:text-fg">{k.howItWorks}</summary>
            <p className="mt-1">{k.description}</p>
          </details>
          {kellyMatches.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{k.noMatches}</p>
          ) : (
            <FilterForm className="mt-4 grid gap-3 sm:grid-cols-[1fr_11rem_9rem_auto] sm:items-end">
              <input type="hidden" name="p" value={period} />
              <Field label={k.match} htmlFor="km">
                <Select
                  id="km"
                  name="km"
                  defaultValue={kellyMatch ? String(kellyMatch.matchId) : ""}
                >
                  <option value="" disabled>
                    {k.chooseMatch}
                  </option>
                  {kellyMatches.map((x) => (
                    <option key={x.matchId} value={x.matchId}>
                      {formatDateTime(x.kickoffAt)} · {x.home} – {x.away}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={k.selection} htmlFor="ks">
                <Select id="ks" name="ks" defaultValue={kellyInput.selection ?? "HOME"}>
                  {KELLY_SELECTIONS.map((sel) => (
                    <option key={sel} value={sel}>
                      {k.selections[sel]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={k.odds} htmlFor="ko">
                <Input
                  id="ko"
                  name="ko"
                  inputMode="decimal"
                  defaultValue={typeof params.ko === "string" ? params.ko : ""}
                  placeholder="2,10"
                />
              </Field>
              <Button type="submit" variant="secondary">
                {k.calculate}
              </Button>
            </FilterForm>
          )}
          {kellyInput.invalidOdds ? (
            <Alert className="mt-3" tone="warning">
              {k.invalidOdds}
            </Alert>
          ) : kellyAsked && !kellyReady ? (
            <p className="mt-3 text-sm text-muted">{k.incomplete}</p>
          ) : null}
          {kellyReady && kellyProbability !== null && kellyInput.odds !== null ? (
            <div className="mt-4">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat label={k.modelProbability}>{formatPercent(modelProbability)}</Stat>
                <Stat label={k.marketProbability}>{formatPercent(marketProbability)}</Stat>
                <Stat label={k.probability}>{formatPercent(kellyProbability)}</Stat>
                <Stat label={k.fairOdds}>{odds(fairOdds(kellyProbability))}</Stat>
                <Stat label={k.expectedValue}>
                  {formatPercent(expectedValue(kellyProbability, kellyInput.odds))}
                </Stat>
              </dl>
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                {bankrolls.map((x) => {
                  const lim = limits.find((l) => l.bankroll_id === x.bankroll_id) ?? null;
                  const s = suggestStake({
                    available: Number(x.available),
                    flatPct: Number(x.flat_stake_pct),
                    probability: kellyProbability,
                    odds: kellyInput.odds,
                    limits: lim,
                  });
                  return (
                    <li
                      key={x.bankroll_id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{x.name}</span>
                        <KindBadge kind={x.kind} />
                      </span>
                      {s.kellyNote === "NON_POSITIVE_EV" ? (
                        <span className="text-muted">{k.noValue}</span>
                      ) : (
                        <span>
                          {k.stake}:{" "}
                          <span className="font-mono text-fg">{formatEuro(s.kelly ?? 0)}</span>
                          {lim?.max_stake != null &&
                          s.kelly !== null &&
                          s.kelly >= Number(lim.max_stake) ? (
                            <span className="ml-1 text-xs text-muted">({k.capped})</span>
                          ) : null}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.bets}</h2>
        {bets.length > 0 ? (
          <a
            href={`/tracker/export?p=${period}`}
            download
            className="text-sm text-muted underline underline-offset-2 hover:text-fg"
          >
            {t.exportCsv}
          </a>
        ) : null}
      </div>
      <Card scrollLabel={t.bets} className="p-0">
        {bets.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t.noBets}</p>
        ) : (
          <table className="w-full min-w-[960px] text-left text-sm">
            <caption className="sr-only">{t.bets}</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{t.placedAt}</Th>
                <Th>{t.event}</Th>
                <Th>{t.bankroll}</Th>
                <Th className="text-right">{t.odds}</Th>
                <Th className="text-right">{t.stake}</Th>
                <Th>{t.status}</Th>
                <Th className="text-right">{t.profit}</Th>
                <Th>
                  <span className="sr-only">{c.actions}</span>
                </Th>
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
                  <td className="px-3 py-3 text-right font-mono">
                    <SignedEuro value={bet.profit} />
                  </td>
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
                        <SubmitButton
                          variant="ghost"
                          className="h-7 px-2 text-xs hover:text-negative-strong"
                          confirmMessage={c.confirmDelete}
                        >
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
