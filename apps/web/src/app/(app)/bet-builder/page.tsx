import {
  BET_PROPOSAL_CATEGORIES,
  DEFAULT_BET_BUILDER_RULES,
  type ActiveBetProposalRow,
  type BetBuilderLatestRunRow,
  type BetProposalLegRow,
} from "@predictra/shared-types";
import type { Metadata } from "next";
import Link from "next/link";
import {
  BetBuilderDisclaimer,
  BetBuilderNav,
  CategoryBadge,
  Metrics,
} from "@/components/bet-builder/shared";
import { Alert, Badge, Button, Card, PageHeader, Select } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import {
  formatSlateDate,
  parseCategory,
  parseSlateDate,
  selectionLabel,
} from "@/lib/bet-builder/format";
import { getLatestRun, listActiveProposals, listProposalLegs } from "@/lib/bet-builder/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";

export const metadata: Metadata = { title: "Smart Bet Builder" };

function ProposalCard({ p, legs }: { p: ActiveBetProposalRow; legs: BetProposalLegRow[] }) {
  const m = getMessages().betBuilder;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={p.category} />
        <Badge>{m.kinds[p.kind]}</Badge>
        <span className="text-xs text-muted">
          {m.rank} {p.rank}
        </span>
        <Link
          href={`/bet-builder/${p.proposal_id}`}
          className="ml-auto text-sm text-positive hover:underline"
        >
          {m.details}
        </Link>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {legs.map((l) => (
          <li key={l.leg_no} className="flex flex-wrap items-baseline justify-between gap-2">
            <span>
              <span className="font-medium">
                {l.home_team_name} – {l.away_team_name}
              </span>{" "}
              <span className="text-muted">
                · {selectionLabel(l.selection, l.home_team_name, l.away_team_name)} ·{" "}
                {formatDateTime(l.kickoff_at)}
              </span>
            </span>
            <span className="font-mono text-xs text-muted">
              {formatPercent(l.probability)} · {formatOdds(l.price)}
            </span>
          </li>
        ))}
      </ul>
      <Metrics
        probability={p.probability}
        price={p.combined_price}
        expectedValue={p.expected_value}
        confidence={p.confidence_score}
      />
      {p.legs_stale > 0 ? (
        <Alert tone="warning">{fillTemplate(m.staleWarning, { n: p.legs_stale })}</Alert>
      ) : null}
      {p.legs_price_changed > 0 ? (
        <Alert>{fillTemplate(m.priceChangedWarning, { n: p.legs_price_changed })}</Alert>
      ) : null}
      <p className="text-xs text-muted">
        {m.model}: {p.model_key} {p.model_version} · {m.oddsObservedAt}{" "}
        {formatDateTime(p.odds_observed_at)}
      </p>
    </Card>
  );
}

function EmptyState({ run }: { run: BetBuilderLatestRunRow | null }) {
  const m = getMessages().betBuilder;
  const text = !run ? m.emptyNoRun : run.status === "FAILED" ? m.emptyFailed : m.emptyZero;
  return (
    <Card>
      <p className="text-sm">{text}</p>
    </Card>
  );
}

export default async function BetBuilderPage({ searchParams }: PageProps<"/bet-builder">) {
  await requireUser();
  const m = getMessages().betBuilder;
  const params = await searchParams;
  const [run, proposals] = await Promise.all([getLatestRun(), listActiveProposals()]);

  const slates = [...new Set(proposals.map((p) => p.slate_date))];
  const slate = parseSlateDate(params.d);
  const category = parseCategory(params.cat);
  const shown = proposals.filter(
    (p) => (!slate || p.slate_date === slate) && (!category || p.category === category),
  );
  const legs = await listProposalLegs(shown.map((p) => p.proposal_id));
  const legsBy = new Map<number, BetProposalLegRow[]>();
  for (const l of legs) legsBy.set(l.proposal_id, [...(legsBy.get(l.proposal_id) ?? []), l]);

  const r = DEFAULT_BET_BUILDER_RULES;
  const rules = run?.rules ?? r;

  return (
    <>
      <PageHeader title={m.title} description={m.description} />
      <BetBuilderDisclaimer />
      <BetBuilderNav current="proposals" />

      <p className="mb-1 text-xs text-muted">
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

      {proposals.length === 0 ? (
        <EmptyState run={run} />
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted">{m.slate}</span>
              <Select name="d" defaultValue={slate ?? ""}>
                <option value="">{m.allSlates}</option>
                {slates.map((d) => (
                  <option key={d} value={d}>
                    {formatSlateDate(d)}
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
            <Button type="submit" variant="secondary">
              {m.show}
            </Button>
          </form>

          {slates
            .filter((d) => !slate || d === slate)
            .map((d) => {
              const day = shown.filter((p) => p.slate_date === d);
              if (day.length === 0) return null;
              return (
                <section key={d} className="mb-6">
                  <h2 className="mb-3 text-lg font-semibold capitalize">{formatSlateDate(d)}</h2>
                  {BET_PROPOSAL_CATEGORIES.map((c) => {
                    const group = day.filter((p) => p.category === c);
                    if (group.length === 0) return null;
                    return (
                      <div key={c} className="mb-4">
                        <h3 className="mb-2 text-sm font-semibold">
                          {m.categories[c]}{" "}
                          <span className="font-normal text-muted">({m.categoryHints[c]})</span>
                        </h3>
                        <div className="grid gap-3 lg:grid-cols-2">
                          {group.map((p) => (
                            <ProposalCard
                              key={p.proposal_id}
                              p={p}
                              legs={legsBy.get(p.proposal_id) ?? []}
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
    </>
  );
}
