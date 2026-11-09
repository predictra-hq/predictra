import type { Metadata } from "next";
import Link from "next/link";
import { BANKROLL_KINDS, MOVEMENT_KINDS } from "@predictra/shared-types";
import { formatEuro, KindBadge, Stat, Th } from "@/components/bankroll/shared";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { listBankrolls, listLimits, listMovements } from "@/lib/bankroll/queries";
import { parseId } from "@/lib/football/format";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { addMovement, createBankroll, deleteBankroll, deleteMovement, saveLimits } from "./actions";

export const metadata: Metadata = { title: "Bankroll" };

export default async function BankrollPage({ searchParams }: PageProps<"/bankroll">) {
  await requireUser();
  const m = getMessages().bankroll;
  const params = await searchParams;
  const [bankrolls, limits] = await Promise.all([listBankrolls(), listLimits()]);
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
        <Card className="mb-6">
          <p className="text-sm text-muted">{m.none}</p>
        </Card>
      ) : (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {bankrolls.map((b) => (
            <Card
              key={b.bankroll_id}
              className={b.bankroll_id === selected?.bankroll_id ? "border-positive/60" : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{b.name}</CardTitle>
                <KindBadge kind={b.kind} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat label={m.balance}>{formatEuro(b.balance)}</Stat>
                <Stat label={m.available}>{formatEuro(b.available)}</Stat>
                <Stat label={m.settledProfit}>{formatEuro(b.settled_profit)}</Stat>
                <Stat label={m.deposits}>{formatEuro(b.deposits)}</Stat>
                <Stat label={m.withdrawals}>{formatEuro(b.withdrawals)}</Stat>
                <Stat label={m.openBets}>
                  {b.open_bets} ({formatEuro(b.open_stakes)})
                </Stat>
              </dl>
              {b.bankroll_id !== selected?.bankroll_id ? (
                <Link
                  href={`/bankroll?b=${b.bankroll_id}`}
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>
              {m.movements} · {selected.name}
            </CardTitle>
            <ActionForm action={addMovement} className="mt-4 grid gap-3 sm:grid-cols-2">
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
              <table className="mt-4 w-full text-left text-sm">
                <caption className="sr-only">{`${m.movements} · ${selected.name}`}</caption>
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <Th>{m.date}</Th>
                    <Th>{m.movementKind}</Th>
                    <Th className="text-right">{m.amount}</Th>
                    <Th />
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
                        {formatEuro(mv.kind === "WITHDRAWAL" ? -mv.amount : mv.amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ActionForm action={deleteMovement} className="inline">
                          <input type="hidden" name="movementId" value={mv.id} />
                          <SubmitButton variant="ghost" className="h-7 px-2 text-xs">
                            {m.deleteMovement}
                          </SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardTitle>
                {m.limits} · {selected.name}
              </CardTitle>
              <p className="mt-1 text-xs text-muted">{m.limitsHint}</p>
              <ActionForm action={saveLimits} className="mt-4 grid gap-3 sm:grid-cols-2">
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
            </Card>

            <Card>
              <CardTitle>{m.deleteBankroll}</CardTitle>
              <ActionForm action={deleteBankroll} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="bankrollId" value={selected.bankroll_id} />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" required className="mt-1" />
                  <span>{m.deleteConfirm}</span>
                </label>
                <SubmitButton variant="danger">{m.deleteBankroll}</SubmitButton>
              </ActionForm>
            </Card>
          </div>
        </div>
      ) : null}

      <Card className="mt-6">
        <CardTitle>{m.create}</CardTitle>
        <ActionForm action={createBankroll} className="mt-4 grid gap-3 sm:grid-cols-3">
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
          <SubmitButton className="sm:col-span-3">{m.createButton}</SubmitButton>
        </ActionForm>
      </Card>

      <p className="mt-8 text-xs text-subtle">{getMessages().tracker.disclaimer}</p>
    </>
  );
}
