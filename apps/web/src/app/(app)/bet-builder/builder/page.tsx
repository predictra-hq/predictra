import type { Metadata } from "next";
import Link from "next/link";
import {
  BuilderPicker,
  type BuilderGroup,
  type BuilderMarket,
} from "@/components/bet-builder/builder-picker";
import { EvaluationPanel } from "@/components/bet-builder/evaluation";
import { BetBuilderDisclaimer, BetBuilderNav } from "@/components/bet-builder/shared";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardTitle, EmptyState, Field, Input, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { evaluateSelections, parseSelectionKeys, selectionKey } from "@/lib/bet-builder/evaluate";
import { selectionLabel } from "@/lib/bet-builder/format";
import { listManualOptions, type ManualOption } from "@/lib/bet-builder/queries";
import { listCompetitions } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";
import { saveManualSlip } from "../actions";

export const metadata: Metadata = { title: "Costruisci — Schedine" };

type Outcome = ManualOption["outcomes"][number];

/** Mercati di una partita nel formato del selettore: esito finale e altre giocate. */
function marketsOf(o: ManualOption): { main: BuilderMarket; more: BuilderMarket[] } {
  const m = getMessages();
  const b = m.betBuilder;
  const sel = m.predictions.selections as Record<string, string>;
  const detail = (x: Outcome) =>
    `${x.probability === null ? "–" : formatPercent(x.probability, 0)} · ${
      x.price === null ? b.builderNoPrice : formatOdds(x.price)
    }`;
  const choice = (x: Outcome, label: string) => ({
    key: selectionKey(x),
    label,
    detail: detail(x),
  });
  const of = (market: string, line: number | null = null) =>
    o.outcomes.filter((x) => x.market === market && x.line === line);
  const lineText = (line: number) => String(line).replace(".", ",");
  const main: BuilderMarket = {
    name: m.predictions.markets["1X2"],
    choices: of("1X2").map((x) => choice(x, sel[x.selection] ?? x.selection)),
  };
  const more: BuilderMarket[] = [
    {
      name: m.predictions.markets.DOUBLE_CHANCE,
      choices: of("DOUBLE_CHANCE").map((x) => choice(x, sel[x.selection] ?? x.selection)),
    },
    ...[1.5, 2.5, 3.5].map((line) => ({
      name: fillTemplate(b.builderGoals, { line: lineText(line) }),
      choices: of("TOTAL_GOALS", line).map((x) =>
        choice(x, `${sel[x.selection] ?? x.selection} ${lineText(line)}`),
      ),
    })),
    {
      name: m.predictions.markets.BTTS,
      choices: of("BTTS").map((x) => choice(x, sel[x.selection] ?? x.selection)),
    },
  ].filter((x) => x.choices.length > 0);
  return { main, more };
}

export default async function BuilderPage({ searchParams }: PageProps<"/bet-builder/builder">) {
  await requireUser();
  const m = getMessages().betBuilder;
  const params = await searchParams;
  const now = new Date();
  const [options, competitions] = await Promise.all([listManualOptions(now), listCompetitions()]);
  const chosenKeys = parseSelectionKeys(params.s).map(selectionKey);
  const outcomes = options.flatMap((o) => o.outcomes);
  const selected = chosenKeys
    .map((k) => outcomes.find((o) => selectionKey(o) === k))
    .filter((o) => o !== undefined);
  const evaluation = evaluateSelections(selected, now);
  const summary =
    evaluation.probability === null
      ? null
      : evaluation.price === null
        ? fillTemplate(m.builderSummaryNoPrice, { p: formatPercent(evaluation.probability, 0) })
        : fillTemplate(m.builderSummary, {
            p: formatPercent(evaluation.probability, 0),
            price: formatOdds(evaluation.price),
          });

  // Partite divise per campionato, nell'ordine dei campionati.
  const groups: BuilderGroup[] = competitions
    .map((c) => ({
      id: String(c.id),
      name: c.name,
      matches: options
        .filter((o) => o.competitionId === c.id)
        .map((o) => ({
          matchId: o.matchId,
          title: `${o.homeTeam} – ${o.awayTeam}`,
          kickoff: formatDateTime(o.kickoffAt),
          ...marketsOf(o),
        })),
    }))
    .filter((g) => g.matches.length > 0);

  return (
    <>
      <PageHeader title={m.builderTitle} description={m.builderDescription} />
      <BetBuilderNav current="builder" />

      {options.length === 0 ? (
        <EmptyState>{m.builderEmpty}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <BuilderPicker
            groups={groups}
            initial={selected.map(selectionKey)}
            summary={summary}
            labels={{
              more: m.builderMore,
              matches: m.builderMatches,
              picked: m.builderPicked,
              none: m.builderNone,
              evaluate: m.evaluate,
              clear: m.builderClear,
            }}
          />

          <div
            id="valutazione"
            className="flex scroll-mt-20 flex-col gap-4 lg:sticky lg:top-4 lg:self-start"
          >
            <Card>
              <CardTitle className="mb-3">{m.evaluation}</CardTitle>
              <ul className="mb-3 flex flex-col gap-1 text-sm">
                {selected.map((x) => (
                  <li key={selectionKey(x)}>
                    {x.homeTeam} – {x.awayTeam} ·{" "}
                    {selectionLabel(x.selection, x.homeTeam, x.awayTeam, x.market, x.line)}
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
                    <input key={selectionKey(x)} type="hidden" name="s" value={selectionKey(x)} />
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
      <p className="mt-6 text-sm">
        <Link href="/bet-builder/slips" className="text-positive-strong hover:underline">
          {m.savedSlips} →
        </Link>
      </p>
      <BetBuilderDisclaimer />
    </>
  );
}
