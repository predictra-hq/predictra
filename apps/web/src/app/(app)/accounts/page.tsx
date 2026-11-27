import type { Metadata } from "next";
import Link from "next/link";
import { BANKROLL_KINDS, MOVEMENT_KINDS } from "@predictra/shared-types";
import { formatEuro, KindBadge, SignedEuro, Stat, Th } from "@/components/bankroll/shared";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import {
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeader,
  ScrollRegion,
  Select,
} from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import {
  listBankrolls,
  listItalianBookmakers,
  listLimits,
  listMovements,
} from "@/lib/bankroll/queries";
import { settleOpenBets } from "@/lib/bankroll/settle";
import { parseId } from "@/lib/football/format";
import { formatDateTime, getMessages } from "@/lib/i18n";
import {
  addMovement,
  createBankroll,
  deleteBankroll,
  deleteMovement,
  saveLimits,
  setBookmaker,
} from "./actions";

import { SITE_PREFIX, untrackedSites } from "@/lib/bankroll/sites";
import { Limited } from "@/components/ui/limited";
import { orFallback } from "@/lib/log";

export const metadata: Metadata = { title: getMessages().pageTitles.bankroll };

/**
 * Sito dove si gioca: uno dei bookmaker di cui raccogliamo le quote, oppure il nome
 * scritto a mano. Serve almeno uno dei due (controllo nell'azione sul server).
 */
function BookmakerFields({
  idPrefix,
  bookmakers,
  code = null,
  name = null,
}: {
  idPrefix: string;
  bookmakers: readonly { code: string; title: string }[];
  code?: string | null;
  name?: string | null;
}) {
  const m = getMessages().bankroll;
  const others = untrackedSites(bookmakers);
  const listed = !code && name ? others.find((s) => s === name) : undefined;
  return (
    <>
      <Field label={m.bookmaker} htmlFor={`${idPrefix}-bookmaker`} hint={m.bookmakerHint}>
        <Select
          id={`${idPrefix}-bookmaker`}
          name="bookmakerCode"
          defaultValue={code ?? (listed ? `${SITE_PREFIX}${listed}` : "")}
        >
          <option value="">{m.bookmakerOther}</option>
          {bookmakers.length > 0 ? (
            <optgroup label={m.bookmakerGroupTracked}>
              {bookmakers.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.title}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label={m.bookmakerGroupUntracked}>
            {others.map((s) => (
              <option key={s} value={`${SITE_PREFIX}${s}`}>
                {s}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>
      <Field
        label={m.bookmakerOtherLabel}
        htmlFor={`${idPrefix}-bookmaker-name`}
        hint={m.bookmakerOtherHint}
      >
        <Input
          id={`${idPrefix}-bookmaker-name`}
          name="bookmakerName"
          maxLength={60}
          defaultValue={listed ? "" : (name ?? "")}
        />
      </Field>
    </>
  );
}

export default async function BankrollPage({ searchParams }: PageProps<"/accounts">) {
  await requireUser();
  const m = getMessages().bankroll;
  const c = getMessages().common;
  const params = await searchParams;
  await settleOpenBets();
  const [bankrolls, limits, bookmakers] = await Promise.all([
    listBankrolls(),
    listLimits(),
    // Senza elenco si può comunque scrivere il nome del sito a mano.
    listItalianBookmakers().catch(orFallback("bankroll/page #1", [])),
  ]);
  const requested = typeof params.b === "string" ? parseId(params.b) : null;
  const selected = bankrolls.find((b) => b.bankroll_id === requested) ?? bankrolls[0] ?? null;
  const movements = selected ? await listMovements(selected.bankroll_id) : [];
  const selectedLimits = selected
    ? limits.find((l) => l.bankroll_id === selected.bankroll_id)
    : undefined;

  return (
    <>
      <PageHeader title={m.title} description={m.description} />

      <h2 className="mb-3 text-lg font-semibold">{m.yourBankrolls}</h2>
      {bankrolls.length === 0 ? (
        <EmptyState className="mb-6">{m.none}</EmptyState>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {bankrolls.map((b) => (
            <Card
              key={b.bankroll_id}
              className={
                b.bankroll_id === selected?.bankroll_id
                  ? "border-positive/60 ring-1 ring-positive/30"
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{b.name}</CardTitle>
                <KindBadge kind={b.kind} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {b.bookmaker_name ? (
                  <>
                    {b.bookmaker_name}
                    <span className="text-xs text-subtle">
                      {" · "}
                      {b.bookmaker_code ? m.bookmakerTracked : m.bookmakerUntracked}
                    </span>
                  </>
                ) : (
                  <span className="text-warning">{m.bookmakerMissing}</span>
                )}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat label={m.balance}>{formatEuro(b.balance)}</Stat>
                <Stat label={m.available}>{formatEuro(b.available)}</Stat>
                <Stat label={m.settledProfit}>
                  <SignedEuro value={b.settled_profit} />
                </Stat>
                <Stat label={m.deposits}>{formatEuro(b.deposits)}</Stat>
                <Stat label={m.withdrawals}>{formatEuro(b.withdrawals)}</Stat>
                <Stat label={m.openBets}>
                  {b.open_bets} ({formatEuro(b.open_stakes)})
                </Stat>
              </dl>
              {b.bankroll_id !== selected?.bankroll_id ? (
                <Link
                  href={`/accounts?b=${b.bankroll_id}`}
                  className="mt-4 inline-block text-sm text-positive-strong hover:underline"
                >
                  {m.select}
                </Link>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {selected ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>{m.movements}</CardTitle>
            <ActionForm action={addMovement} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input type="hidden" name="bankrollId" value={selected.bankroll_id} />
              <Field label={m.movementKind} htmlFor="mv-kind">
                <Select id="mv-kind" name="kind" defaultValue="DEPOSIT">
                  {MOVEMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {m.movementKinds[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={m.amount} htmlFor="mv-amount" hint={m.amountHint}>
                <Input id="mv-amount" name="amount" inputMode="decimal" required />
              </Field>
              <Field label={m.date} htmlFor="mv-date">
                <Input id="mv-date" name="occurredAt" type="datetime-local" />
              </Field>
              <Field label={m.note} htmlFor="mv-note">
                <Input id="mv-note" name="note" maxLength={500} />
              </Field>
              <SubmitButton className="sm:col-span-2">{m.addMovement}</SubmitButton>
            </ActionForm>
            {movements.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{m.noMovements}</p>
            ) : (
              <ScrollRegion label={`${m.movements} · ${selected.name}`} className="mt-4">
                <Limited total={movements.length}>
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <caption className="sr-only">{`${m.movements} · ${selected.name}`}</caption>
                    <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <Th>{m.date}</Th>
                        <Th>{m.movementKind}</Th>
                        <Th className="text-right">{m.amount}</Th>
                        <Th>
                          <span className="sr-only">{c.actions}</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((mv) => (
                        <tr key={mv.id} className="border-b border-border align-top last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 text-muted">
                            {formatDateTime(mv.occurred_at)}
                          </td>
                          <td className="px-3 py-2">
                            {m.movementKinds[mv.kind]}
                            {mv.note ? (
                              <span className="block text-xs text-muted">{mv.note}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            <SignedEuro value={mv.kind === "WITHDRAWAL" ? -mv.amount : mv.amount} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <ActionForm action={deleteMovement} className="inline">
                              <input type="hidden" name="movementId" value={mv.id} />
                              <SubmitButton
                                variant="ghost"
                                className="h-7 px-2 text-xs hover:text-negative-strong"
                                confirmMessage={c.confirmDelete}
                              >
                                {m.deleteMovement}
                              </SubmitButton>
                            </ActionForm>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Limited>
              </ScrollRegion>
            )}
          </Card>

          <div className="flex flex-col gap-4">
            <details className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
              <summary className="cursor-pointer text-base font-semibold">{m.limits}</summary>
              <p className="mt-1 text-xs text-muted">{m.limitsHint}</p>
              <ActionForm
                action={saveLimits}
                className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="bankrollId" value={selected.bankroll_id} />
                <Field label={m.maxStake} htmlFor="lim-stake">
                  <Input
                    id="lim-stake"
                    name="maxStake"
                    inputMode="decimal"
                    defaultValue={selectedLimits?.max_stake ?? ""}
                  />
                </Field>
                <Field label={m.maxOpenBets} htmlFor="lim-open">
                  <Input
                    id="lim-open"
                    name="maxOpenBets"
                    inputMode="numeric"
                    defaultValue={selectedLimits?.max_open_bets ?? ""}
                  />
                </Field>
                <Field label={m.maxDailyLoss} htmlFor="lim-day">
                  <Input
                    id="lim-day"
                    name="maxDailyLoss"
                    inputMode="decimal"
                    defaultValue={selectedLimits?.max_daily_loss ?? ""}
                  />
                </Field>
                <Field label={m.maxWeeklyLoss} htmlFor="lim-week">
                  <Input
                    id="lim-week"
                    name="maxWeeklyLoss"
                    inputMode="decimal"
                    defaultValue={selectedLimits?.max_weekly_loss ?? ""}
                  />
                </Field>
                <SubmitButton variant="secondary" className="sm:col-span-2">
                  {m.saveLimits}
                </SubmitButton>
              </ActionForm>
            </details>

            <details
              open={!selected.bookmaker_name}
              className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5"
            >
              <summary className="cursor-pointer text-base font-semibold">
                {selected.bookmaker_name ? m.bookmakerChange : m.bookmakerSet}
              </summary>
              <ActionForm action={setBookmaker} className="mt-4 grid grid-cols-1 gap-3">
                <input type="hidden" name="bankrollId" value={selected.bankroll_id} />
                <BookmakerFields
                  idPrefix="bk"
                  bookmakers={bookmakers}
                  code={selected.bookmaker_code}
                  name={selected.bookmaker_code ? null : selected.bookmaker_name}
                />
                <SubmitButton variant="secondary">{m.bookmakerSave}</SubmitButton>
              </ActionForm>
            </details>

            {/* Azione irreversibile: chiusa finché non la si apre. */}
            <details className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
              <summary className="cursor-pointer text-sm text-muted hover:text-fg">
                {m.deleteBankroll}
              </summary>
              <ActionForm action={deleteBankroll} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="bankrollId" value={selected.bankroll_id} />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" required className="mt-1" />
                  <span>{m.deleteConfirm}</span>
                </label>
                <SubmitButton variant="danger">{m.deleteBankroll}</SubmitButton>
              </ActionForm>
            </details>
          </div>
        </div>
      ) : null}

      {/* Con almeno un bankroll il modulo resta chiuso; senza, è aperto. */}
      <details
        open={bankrolls.length === 0}
        className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface p-5"
      >
        <summary className="cursor-pointer">
          <CardTitle className="inline">{m.create}</CardTitle>
        </summary>
        <ActionForm action={createBankroll} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={m.name} htmlFor="br-name">
            <Input id="br-name" name="name" maxLength={60} required />
          </Field>
          <Field label={m.kind} htmlFor="br-kind" hint={m.kindHint}>
            <Select id="br-kind" name="kind" defaultValue="SIMULATED">
              {BANKROLL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {m.kinds[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={m.flatPct} htmlFor="br-flat" hint={m.flatPctHint}>
            <Input id="br-flat" name="flatPct" inputMode="decimal" placeholder="1" />
          </Field>
          <BookmakerFields idPrefix="br" bookmakers={bookmakers} />
          <SubmitButton className="sm:col-span-3">{m.createButton}</SubmitButton>
        </ActionForm>
      </details>

      <p className="mt-8 text-xs text-subtle">{getMessages().tracker.disclaimer}</p>
    </>
  );
}
