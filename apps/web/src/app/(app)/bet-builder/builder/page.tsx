import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import {
  BuilderPicker,
  type BuilderGroup,
  type BuilderMarket,
} from "@/components/bet-builder/builder-picker";
import { AutoBuilderForm, SlipAnalysisCard } from "@/components/bet-builder/auto-builder";
import { EvaluationPanel } from "@/components/bet-builder/evaluation";
import { ShareSlip } from "@/components/community/share-slip";
import { shareProps } from "@/components/community/share-labels";
import { pickKey } from "@/lib/community/slip";
import { BetBuilderDisclaimer, BetBuilderNav } from "@/components/bet-builder/shared";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import {
  Alert,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeader,
} from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { analyzeSlip, autoBuild, parseAutoLegs, parseAutoLevel } from "@/lib/bet-builder/auto";
import { evaluateSelections, parseSelectionKeys, selectionKey } from "@/lib/bet-builder/evaluate";
import { selectionLabel } from "@/lib/bet-builder/format";
import { listManualOptions, type ManualOption } from "@/lib/bet-builder/queries";
import { listCompetitions } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";
import { saveManualSlip } from "../actions";

export const metadata: Metadata = { title: getMessages().pageTitles.betBuilderBuilder };

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

/** Indirizzo di Costruisci con queste giocate scelte. */
function builderHref(keys: string[]): string {
  const params = new URLSearchParams(keys.map((k) => ["s", k]));
  const query = params.toString();
  return query ? `/bet-builder/builder?${query}` : "/bet-builder/builder";
}

export default async function BuilderPage({ searchParams }: PageProps<"/bet-builder/builder">) {
  await requireUser();
  const m = getMessages().betBuilder;
  const params = await searchParams;
  const now = new Date();
  const [options, competitions] = await Promise.all([listManualOptions(now), listCompetitions()]);
  // «Costruiscila per me» (ADR 0081): con `?auto=` la schedina la riempiono i dati.
  const autoLevel = parseAutoLevel(params.auto);
  const autoLegs = parseAutoLegs(params.legs);
  const auto = autoLevel ? autoBuild(options, autoLevel, autoLegs, now) : null;
  const chosenKeys = auto
    ? auto.selections.map(selectionKey)
    : parseSelectionKeys(params.s).map(selectionKey);
  const outcomes = options.flatMap((o) => o.outcomes);
  const selected = chosenKeys
    .map((k) => outcomes.find((o) => selectionKey(o) === k))
    .filter((o) => o !== undefined);
  const evaluation = evaluateSelections(selected, now);
  const analysis = evaluation.modellable ? analyzeSlip(selected, options, now) : null;
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

      {options.length > 0 ? <AutoBuilderForm level={autoLevel} legs={autoLegs} /> : null}
      {auto && autoLevel ? (
        <Alert
          tone={auto.selections.length === 0 ? "warning" : "positive"}
          className="mb-4"
          aria-live="polite"
        >
          {auto.selections.length === 0
            ? m.autoEmpty
            : auto.reached !== null && auto.reached !== autoLevel
              ? fillTemplate(m.autoReachedOther, {
                  n: auto.selections.length,
                  level: m.categories[autoLevel],
                  reached: m.categories[auto.reached],
                })
              : fillTemplate(m.autoDone, {
                  n: auto.selections.length,
                  level: m.categories[autoLevel],
                })}
        </Alert>
      ) : null}

      {options.length === 0 ? (
        <EmptyState>{m.builderEmpty}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <BuilderPicker
            key={chosenKeys.join(",")}
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
              {selected.length > 0 ? (
                <>
                  <ul className="mb-2 flex flex-col divide-y divide-border">
                    {selected.map((x) => {
                      const key = selectionKey(x);
                      const pick = selectionLabel(
                        x.selection,
                        x.homeTeam,
                        x.awayTeam,
                        x.market,
                        x.line,
                      );
                      return (
                        <li key={key} className="flex items-start gap-2 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{pick}</p>
                            <p className="truncate text-xs text-muted">
                              {x.homeTeam} – {x.awayTeam} · {formatDateTime(x.kickoffAt)}
                            </p>
                          </div>
                          <span className="shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted">
                            {fillTemplate(m.builderPickDetail, {
                              p: x.probability === null ? "–" : formatPercent(x.probability, 0),
                              price: x.price === null ? "–" : formatOdds(x.price),
                            })}
                          </span>
                          <Link
                            href={builderHref(chosenKeys.filter((k) => k !== key))}
                            scroll={false}
                            aria-label={fillTemplate(m.builderRemove, { pick })}
                            className="-mr-1 shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
                          >
                            <X size={16} aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <Link
                    href="/bet-builder/builder"
                    scroll={false}
                    className="mb-4 inline-block text-xs font-medium text-negative-strong hover:underline"
                  >
                    {m.builderClearAll}
                  </Link>
                </>
              ) : null}
              <EvaluationPanel evaluation={evaluation} />
              {selected.length > 0 ? (
                <div className="mt-4">
                  <ShareSlip
                    {...shareProps({
                      title: m.builderShareTitle,
                      picks: selected.map((x) => ({
                        match: `${x.homeTeam} – ${x.awayTeam}`,
                        pick: selectionLabel(x.selection, x.homeTeam, x.awayTeam, x.market, x.line),
                        price: x.price,
                        key: pickKey({
                          matchId: x.matchId,
                          market: x.market ?? "1X2",
                          line: x.line ?? null,
                          selection: x.selection,
                        }),
                      })),
                      price: evaluation.price,
                      probability: evaluation.probability,
                    })}
                  />
                </div>
              ) : null}
            </Card>
            {analysis ? (
              <SlipAnalysisCard
                analysis={analysis}
                hrefFor={builderHref}
                picks={selected.map(
                  (x) =>
                    `${x.homeTeam} – ${x.awayTeam}: ${selectionLabel(x.selection, x.homeTeam, x.awayTeam, x.market, x.line)}${x.probability === null ? "" : ` (${formatPercent(x.probability, 0)})`}`,
                )}
              />
            ) : null}
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
