import {
  BET_PROPOSAL_CATEGORIES,
  DEFAULT_BET_BUILDER_RULES,
  type ActiveBetProposalRow,
  type BetBuilderLatestRunRow,
  type BetProposalLegRow,
} from "@predictra/shared-types";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  BetBuilderDisclaimer,
  BetBuilderNav,
  CategoryBadge,
  StakeSimulation,
} from "@/components/bet-builder/shared";
import { Ticket, TicketLeg, TicketTotals } from "@/components/bet-builder/ticket";
import { FilterForm } from "@/components/ui/filter-form";
import {
  Alert,
  Button,
  CardSkeleton,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import {
  formatRound,
  parseCategory,
  parseSlateDate,
  parseStake,
  roundStartOf,
  selectionLabel,
} from "@/lib/bet-builder/format";
import { SchedineSection } from "@/components/bet-builder/bollette";
import { LikelySection } from "@/components/bet-builder/likely";
import { getLatestRun, listActiveProposals, listProposalLegs } from "@/lib/bet-builder/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";
import { hasPermission } from "@predictra/shared-types";

export const metadata: Metadata = { title: "Schedine" };

/** Nome del modello per chi legge (es. «Dixon-Coles»), senza la versione. */
function modelName(key: string): string {
  return (getMessages().modelIntelligence.modelNames as Record<string, string>)[key] ?? key;
}

function ProposalCard({
  p,
  legs,
  stake,
  technical,
}: {
  p: ActiveBetProposalRow;
  legs: BetProposalLegRow[];
  stake: number | null;
  /** Modello e versione: solo per chi gestisce il sistema. */
  technical: boolean;
}) {
  const m = getMessages().betBuilder;
  return (
    <Ticket
      title={`${m.categories[p.category]} · ${m.kinds[p.kind]}`}
      badge={<CategoryBadge category={p.category} />}
      totals={
        <TicketTotals
          priceLabel={m.combinedPrice}
          price={formatOdds(p.combined_price)}
          items={[
            { label: m.probability, value: formatPercent(p.probability, 0) },
            {
              label: m.expectedValue,
              value:
                p.expected_value === null
                  ? "—"
                  : `${p.expected_value >= 0 ? "+" : "−"}${formatPercent(Math.abs(p.expected_value), 1)}`,
              tone: "positive",
            },
          ]}
        />
      }
      footer={
        <div className="flex flex-col gap-2">
          {stake !== null && p.combined_price !== null && p.probability !== null ? (
            <StakeSimulation stake={stake} price={p.combined_price} probability={p.probability} />
          ) : null}
          {p.legs_stale > 0 ? (
            <Alert tone="warning">{fillTemplate(m.staleWarning, { n: p.legs_stale })}</Alert>
          ) : null}
          {p.legs_price_changed > 0 ? (
            <Alert>{fillTemplate(m.priceChangedWarning, { n: p.legs_price_changed })}</Alert>
          ) : null}
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              {fillTemplate(m.oddsUpdated, { at: formatDateTime(p.odds_observed_at) })}
              {technical ? ` · ${m.model}: ${modelName(p.model_key)}` : ""}
            </span>
            <Link
              href={`/bet-builder/${p.proposal_id}${stake !== null ? `?s=${stake}` : ""}`}
              className="font-medium text-positive-strong hover:underline"
            >
              {m.details} →
            </Link>
          </p>
        </div>
      }
    >
      {legs.map((l) => (
        <TicketLeg
          key={l.leg_no}
          time={formatDateTime(l.kickoff_at)}
          match={`${l.home_team_name} – ${l.away_team_name}`}
          pick={selectionLabel(l.selection, l.home_team_name, l.away_team_name, l.market, l.line)}
          probability={formatPercent(l.probability, 0)}
          price={formatOdds(l.price)}
        />
      ))}
    </Ticket>
  );
}

function NoProposals({ run }: { run: BetBuilderLatestRunRow | null }) {
  const m = getMessages().betBuilder;
  const text = !run ? m.emptyNoRun : run.status === "FAILED" ? m.emptyFailed : m.emptyZero;
  // Nessuna proposta: una riga sola, la pagina resta corta.
  return <p className="mb-6 text-sm text-muted">{text}</p>;
}

export default async function BetBuilderPage({ searchParams }: PageProps<"/bet-builder">) {
  const user = await requireUser();
  const technical = hasPermission(user.roles, "agents.monitor");
  const m = getMessages().betBuilder;
  const params = await searchParams;
  const [run, proposals] = await Promise.all([getLatestRun(), listActiveProposals()]);

  // Turni (ADR 0036): le multiple uniscono partite da venerdì a lunedì o da martedì a giovedì.
  const slates = [...new Set(proposals.map((p) => roundStartOf(p.slate_date)))].sort();
  const slate = parseSlateDate(params.d);
  const category = parseCategory(params.cat);
  const stake = parseStake(params.s);
  const shown = proposals
    .filter(
      (p) =>
        (!slate || roundStartOf(p.slate_date) === slate) && (!category || p.category === category),
    )
    .sort((a, b) => a.rank - b.rank);
  const legs = await listProposalLegs(shown.map((p) => p.proposal_id));
  const legsBy = new Map<number, BetProposalLegRow[]>();
  for (const l of legs) legsBy.set(l.proposal_id, [...(legsBy.get(l.proposal_id) ?? []), l]);

  const r = DEFAULT_BET_BUILDER_RULES;
  const rules = run?.rules ?? r;

  return (
    <>
      <PageHeader title={m.title} description={m.description} />
      <BetBuilderNav current="proposals" />

      <Suspense fallback={<CardSkeleton className="mb-6 h-64" />}>
        <SchedineSection stake={stake} />
      </Suspense>

      <h2 className="mb-1 text-lg font-semibold">{m.valueTitle}</h2>
      {proposals.length > 0 ? (
        <>
          <p className="mb-2 text-sm text-muted">{m.valueDescription}</p>
          {technical ? (
            <details className="mb-4 text-xs text-muted">
              <summary className="cursor-pointer">{m.technicalDetails}</summary>
              <p className="mb-1 mt-2 text-xs text-muted">
                {fillTemplate(m.thresholds, {
                  ev: formatPercent(rules.min_expected_value, 0),
                  p: formatPercent(rules.min_probability, 0),
                  c: String(rules.min_confidence_score).replace(".", ","),
                  legs: rules.max_legs,
                })}
              </p>
              {run ? (
                <p className="mb-4 text-xs text-muted">
                  {fillTemplate(m.lastRun, {
                    at: formatDateTime(run.finished_at ?? run.started_at),
                    candidates: run.candidates_evaluated,
                    proposals: run.proposals_written,
                  })}
                </p>
              ) : null}
            </details>
          ) : null}
        </>
      ) : null}

      {proposals.length === 0 ? (
        <NoProposals run={run} />
      ) : (
        <>
          <FilterForm className="mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted">{m.slate}</span>
              <Select name="d" defaultValue={slate ?? ""}>
                <option value="">{m.allSlates}</option>
                {slates.map((d) => (
                  <option key={d} value={d}>
                    {formatRound(d)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted">{m.category}</span>
              <Select name="cat" defaultValue={category ?? ""}>
                <option value="">{m.allCategories}</option>
                {BET_PROPOSAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {m.categories[c]} ({m.categoryHints[c]})
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted">{m.stake}</span>
              <Input
                name="s"
                inputMode="decimal"
                placeholder={m.stakePlaceholder}
                defaultValue={typeof params.s === "string" ? params.s : ""}
                className="w-40"
              />
            </label>
            <Button type="submit" variant="secondary">
              {m.show}
            </Button>
          </FilterForm>

          {shown.length === 0 ? <EmptyState>{m.emptyFiltered}</EmptyState> : null}
          {slates
            .filter((d) => !slate || d === slate)
            .map((d) => {
              const day = shown.filter((p) => roundStartOf(p.slate_date) === d);
              if (day.length === 0) return null;
              return (
                <section key={d} className="mb-6">
                  <h2 className="mb-3 text-lg font-semibold">
                    {fillTemplate(m.roundTitle, { round: formatRound(d) })}
                  </h2>
                  {BET_PROPOSAL_CATEGORIES.map((c) => {
                    const group = day.filter((p) => p.category === c);
                    if (group.length === 0) return null;
                    return (
                      <div key={c} className="mb-4">
                        <h3 className="mb-2 text-sm font-semibold">
                          {m.categories[c]}{" "}
                          <span className="font-normal text-muted">({m.categoryHints[c]})</span>
                        </h3>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                          {group.map((p) => (
                            <ProposalCard
                              key={p.proposal_id}
                              p={p}
                              legs={legsBy.get(p.proposal_id) ?? []}
                              stake={stake}
                              technical={technical}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
        </>
      )}

      <details className="mb-6">
        <summary className="mb-3 cursor-pointer text-sm text-positive">{m.likelyToggle}</summary>
        <Suspense fallback={<CardSkeleton className="mb-6 h-64" />}>
          <LikelySection stake={stake} />
        </Suspense>
      </details>
      <BetBuilderDisclaimer />
    </>
  );
}
