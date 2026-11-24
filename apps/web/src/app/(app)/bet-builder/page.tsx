import {
  DEFAULT_BET_BUILDER_RULES,
  hasPermission,
  type ActiveBetProposalRow,
  type BetBuilderLatestRunRow,
  type BetProposalLegRow,
} from "@predictra/shared-types";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown } from "lucide-react";
import { SchedineSection } from "@/components/bet-builder/bollette";
import { slipWindowFrom, WindowTabs } from "@/components/bet-builder/window-tabs";
import { LikelySection } from "@/components/bet-builder/likely";
import {
  BetBuilderDisclaimer,
  BetBuilderNav,
  CategoryBadge,
} from "@/components/bet-builder/shared";
import { StakeBox } from "@/components/bet-builder/stake-box";
import { stakeBoxLabels } from "@/components/bet-builder/stake-labels";
import {
  Ticket,
  TICKET_GRID,
  TicketLeg,
  TicketTotals,
  whenAndWhere,
} from "@/components/bet-builder/ticket";
import { Alert, CardSkeleton, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { formatRound, roundStartOf, selectionLabel } from "@/lib/bet-builder/format";
import { getLatestRun, listActiveProposals, listProposalLegs } from "@/lib/bet-builder/queries";
import { slipTrackerHref } from "@/lib/bet-builder/register";
import { listCompetitions } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";

export const metadata: Metadata = { title: "Schedine" };

/** Fasce di quota delle proposte con valore (ADR 0067): si apre solo quella che interessa. */
const PRICE_BANDS = [
  { key: "low", max: 3 },
  { key: "mid", max: 6 },
  { key: "high", max: Infinity },
] as const;
type PriceBand = (typeof PRICE_BANDS)[number]["key"];

function bandOf(price: number | null): PriceBand {
  return PRICE_BANDS.find((b) => (price ?? 0) < b.max)?.key ?? "high";
}

/** Puntata d'esempio per «Gioca questa schedina» quando non c'è una consigliata. */
const EXAMPLE_STAKE = 10;

/** Nome del modello per chi legge (es. «Dixon-Coles»), senza la versione. */
function modelName(key: string): string {
  return (getMessages().modelIntelligence.modelNames as Record<string, string>)[key] ?? key;
}

function ProposalCard({
  p,
  legs,
  technical,
  competitions,
}: {
  p: ActiveBetProposalRow;
  legs: BetProposalLegRow[];
  /** Modello: solo per chi gestisce il sistema. */
  technical: boolean;
  competitions: ReadonlyMap<number, string>;
}) {
  const m = getMessages().betBuilder;
  const title =
    legs.length > 1 ? fillTemplate(m.bollette.legs, { n: legs.length }) : m.kinds[p.kind];
  return (
    <Ticket
      title={title}
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
      play={
        p.combined_price !== null ? (
          <StakeBox
            defaultStake={EXAMPLE_STAKE}
            price={p.combined_price}
            site={null}
            registerHref={slipTrackerHref(
              legs.map((l) => ({
                matchId: l.match_id,
                home: l.home_team_name,
                away: l.away_team_name,
                market: l.market,
                line: l.line,
                selection: l.selection,
                bookmaker: l.bookmaker_title,
              })),
              p.combined_price,
              {
                market: m.kinds[p.kind],
                selection: `${m.categories[p.category]} · ${title}`,
              },
              null,
            )}
            labels={stakeBoxLabels()}
          />
        ) : undefined
      }
      footer={
        <div className="flex flex-col gap-1.5">
          {p.legs_stale > 0 ? (
            <Alert tone="warning">{fillTemplate(m.staleWarning, { n: p.legs_stale })}</Alert>
          ) : null}
          {p.legs_price_changed > 0 ? (
            <Alert>{fillTemplate(m.priceChangedWarning, { n: p.legs_price_changed })}</Alert>
          ) : null}
          <p className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {fillTemplate(m.oddsUpdated, { at: formatDateTime(p.odds_observed_at) })}
              {technical ? ` · ${m.model}: ${modelName(p.model_key)}` : ""}
            </span>
            <Link
              href={`/bet-builder/${p.proposal_id}`}
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
          time={whenAndWhere(
            { kickoffAt: l.kickoff_at, competitionId: l.competition_id },
            competitions,
          )}
          match={
            <Link href={`/match-center/${l.match_id}`} className="hover:underline">
              {l.home_team_name} – {l.away_team_name}
            </Link>
          }
          pick={selectionLabel(l.selection, l.home_team_name, l.away_team_name, l.market, l.line)}
          probability={`${formatPercent(l.probability, 0)} · ${l.bookmaker_title}`}
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

/**
 * Proposte: schedine consigliate in alto, poi le proposte con valore divise per turno e
 * per fascia di quota in riquadri che si aprono (ADR 0067), così la pagina resta corta.
 */
export default async function BetBuilderPage({ searchParams }: PageProps<"/bet-builder">) {
  const user = await requireUser();
  const window = slipWindowFrom((await searchParams).w);
  const technical = hasPermission(user.roles, "agents.monitor");
  const m = getMessages().betBuilder;
  const [run, proposals, competitionList] = await Promise.all([
    getLatestRun(),
    listActiveProposals(),
    listCompetitions().catch(() => []),
  ]);
  const competitions = new Map(competitionList.map((c) => [c.id, c.name]));

  // Turni (ADR 0036): le multiple uniscono partite da venerdì a lunedì o da martedì a giovedì.
  const slates = [...new Set(proposals.map((p) => roundStartOf(p.slate_date)))].sort();
  const sorted = [...proposals].sort(
    (a, b) => (a.combined_price ?? 0) - (b.combined_price ?? 0) || a.rank - b.rank,
  );
  const legs = await listProposalLegs(sorted.map((p) => p.proposal_id));
  const legsBy = new Map<number, BetProposalLegRow[]>();
  for (const l of legs) legsBy.set(l.proposal_id, [...(legsBy.get(l.proposal_id) ?? []), l]);
  const rules = run?.rules ?? DEFAULT_BET_BUILDER_RULES;

  return (
    <>
      <PageHeader title={m.title} description={m.description} />
      <BetBuilderNav current="proposals" />
      <WindowTabs current={window} path="/bet-builder" />

      <Suspense fallback={<CardSkeleton className="mb-6 h-64" />}>
        <SchedineSection stake={null} window={window} />
      </Suspense>

      <h2 className="mb-1 text-lg font-semibold">{m.valueTitle}</h2>
      {proposals.length === 0 ? (
        <NoProposals run={run} />
      ) : (
        <>
          <p className="mb-3 hidden text-sm text-muted sm:block">{m.valueDescription}</p>
          {slates.map((d) => {
            const round = sorted.filter((p) => roundStartOf(p.slate_date) === d);
            return (
              <section key={d} className="mb-6">
                <h3 className="mb-2 text-sm text-muted">
                  {fillTemplate(m.roundTitle, { round: formatRound(d) })}
                </h3>
                <div className="flex flex-col gap-2">
                  {PRICE_BANDS.map((band, index) => {
                    const group = round.filter((p) => bandOf(p.combined_price) === band.key);
                    if (group.length === 0) return null;
                    return (
                      <details
                        key={band.key}
                        open={index === 0}
                        className="group rounded-[var(--radius-card)] border border-border bg-surface/40 p-3"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold hover:text-fg [&::-webkit-details-marker]:hidden">
                          <ChevronDown
                            size={16}
                            aria-hidden="true"
                            className="shrink-0 transition-transform group-open:rotate-180"
                          />
                          {m.priceBands[band.key]}
                          <span className="font-normal text-subtle">
                            {fillTemplate(m.priceBandCount, { n: group.length })}
                          </span>
                        </summary>
                        <div className={`mt-3 ${TICKET_GRID}`}>
                          {group.map((p) => (
                            <ProposalCard
                              key={p.proposal_id}
                              p={p}
                              legs={legsBy.get(p.proposal_id) ?? []}
                              technical={technical}
                              competitions={competitions}
                            />
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {technical ? (
            <details className="mb-6 text-xs text-muted">
              <summary className="cursor-pointer">{m.technicalDetails}</summary>
              <p className="mb-1 mt-2">
                {fillTemplate(m.thresholds, {
                  ev: formatPercent(rules.min_expected_value, 0),
                  p: formatPercent(rules.min_probability, 0),
                  c: String(rules.min_confidence_score).replace(".", ","),
                  legs: rules.max_legs,
                })}
              </p>
              {run ? (
                <p>
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
      )}

      <details className="mb-6">
        <summary className="mb-3 cursor-pointer text-sm text-positive">{m.likelyToggle}</summary>
        <Suspense fallback={<CardSkeleton className="mb-6 h-64" />}>
          <LikelySection stake={null} />
        </Suspense>
      </details>
      <BetBuilderDisclaimer />
    </>
  );
}
