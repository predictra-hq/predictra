import type { Metadata } from "next";
import { EvaluationPanel } from "@/components/bet-builder/evaluation";
import { BetBuilderDisclaimer, BetBuilderNav } from "@/components/bet-builder/shared";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeader,
} from "@/components/ui/primitives";
import { FilterForm } from "@/components/ui/filter-form";
import { requireUser } from "@/lib/auth/dal";
import { evaluateSelections, parseSelectionKeys } from "@/lib/bet-builder/evaluate";
import { selectionLabel } from "@/lib/bet-builder/format";
import { listManualOptions } from "@/lib/bet-builder/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";
import { saveManualSlip } from "../actions";

export const metadata: Metadata = { title: "Costruisci — Schedine" };

export default async function BuilderPage({ searchParams }: PageProps<"/bet-builder/builder">) {
  await requireUser();
  const m = getMessages().betBuilder;
  const params = await searchParams;
  const now = new Date();
  const options = await listManualOptions(now);
  const chosenKeys = parseSelectionKeys(params.s);
  const chosen = new Set(chosenKeys.map((k) => `${k.matchId}:${k.selection}`));
  const outcomes = options.flatMap((o) => o.outcomes);
  const selected = chosenKeys
    .map((k) => outcomes.find((o) => o.matchId === k.matchId && o.selection === k.selection))
    .filter((o) => o !== undefined);
  const evaluation = evaluateSelections(selected, now);

  return (
    <>
      <PageHeader title={m.builderTitle} description={m.builderDescription} />
      <BetBuilderDisclaimer />
      <BetBuilderNav current="builder" />

      {options.length === 0 ? (
        <EmptyState>{m.builderEmpty}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <FilterForm className="flex flex-col gap-3">
            {options.map((o) => (
              <fieldset
                key={o.matchId}
                className="rounded-[var(--radius-card)] border border-border bg-surface p-3"
              >
                <legend className="px-1 text-sm font-medium">
                  {o.homeTeam} – {o.awayTeam}{" "}
                  <span className="font-normal text-muted">· {formatDateTime(o.kickoffAt)}</span>
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {o.outcomes.map((x) => {
                    const key = `${x.matchId}:${x.selection}`;
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm transition-colors hover:border-border-strong has-[:checked]:border-positive/60 has-[:checked]:bg-positive-soft"
                      >
                        <input
                          type="checkbox"
                          name="s"
                          value={key}
                          defaultChecked={chosen.has(key)}
                          className="mt-1"
                        />
                        <span className="flex flex-col">
                          <span>{selectionLabel(x.selection, x.homeTeam, x.awayTeam)}</span>
                          <span className="font-mono text-xs text-muted">
                            {formatPercent(x.probability)} ·{" "}
                            {x.price === null ? m.noOdds : formatOdds(x.price)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <Button type="submit" className="self-start">
              {m.evaluate}
            </Button>
          </FilterForm>

          <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardTitle className="mb-3">{m.evaluation}</CardTitle>
              <ul className="mb-3 flex flex-col gap-1 text-sm">
                {selected.map((x) => (
                  <li key={`${x.matchId}:${x.selection}`}>
                    {x.homeTeam} – {x.awayTeam} ·{" "}
                    {selectionLabel(x.selection, x.homeTeam, x.awayTeam)}
                  </li>
                ))}
              </ul>
              <EvaluationPanel evaluation={evaluation} />
            </Card>
            {selected.length > 0 ? (
              <Card>
                <CardTitle className="mb-3">{m.saveSlip}</CardTitle>
                <ActionForm action={saveManualSlip}>
                  {selected.map((x) => (
                    <input
                      key={`${x.matchId}:${x.selection}`}
                      type="hidden"
                      name="s"
                      value={`${x.matchId}:${x.selection}`}
                    />
                  ))}
                  <Field label={m.slipName} htmlFor="name">
                    <Input
                      id="name"
                      name="name"
                      maxLength={80}
                      required
                      defaultValue={fillTemplate(m.slipNameDefault, {
                        date: formatDateTime(now),
                      })}
                    />
                  </Field>
                  <SubmitButton>{m.saveSlip}</SubmitButton>
                </ActionForm>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
