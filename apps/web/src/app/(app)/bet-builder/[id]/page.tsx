import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BetBuilderDisclaimer,
  BetBuilderNav,
  CategoryBadge,
  Metrics,
  StakeSimulation,
} from "@/components/bet-builder/shared";
import { FreshnessBadge } from "@/components/football/badges";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Badge, Card, CardTitle, Field, Input, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import {
  confidenceLabel,
  formatSlateDate,
  parseStake,
  selectionLabel,
} from "@/lib/bet-builder/format";
import { getProposal, listProposalLegs } from "@/lib/bet-builder/queries";
import { parseId } from "@/lib/football/format";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatDecimal, formatOdds, formatPercent } from "@/lib/odds/format";
import { saveProposalSlip } from "../actions";
import { hasPermission } from "@predictra/shared-types";

export const metadata: Metadata = { title: "Proposta — Schedine" };

export default async function ProposalPage({
  params,
  searchParams,
}: PageProps<"/bet-builder/[id]">) {
  const user = await requireUser();
  const technical = hasPermission(user.roles, "agents.monitor");
  const m = getMessages().betBuilder;
  const { id } = await params;
  const stake = parseStake((await searchParams).s);
  const proposalId = parseId(id);
  if (proposalId === null) notFound();
  const [proposal, legs] = await Promise.all([
    getProposal(proposalId),
    listProposalLegs([proposalId]),
  ]);
  if (!proposal) notFound();

  return (
    <>
      <PageHeader
        title={`${m.categories[proposal.category]} · ${m.kinds[proposal.kind]}`}
        description={`${formatSlateDate(proposal.slate_date)} · ${m.rank} ${proposal.rank}`}
      />
      <BetBuilderNav current="proposals" />
      <Link
        href={stake !== null ? `/bet-builder?s=${stake}` : "/bet-builder"}
        className="mb-4 inline-block text-sm text-positive hover:underline"
      >
        {m.back}
      </Link>

      <Card className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={proposal.category} />
          <Badge>{fillTemplate("{n} " + m.legs.toLowerCase(), { n: proposal.legs_count })}</Badge>
        </div>
        <Metrics
          probability={proposal.probability}
          price={proposal.combined_price}
          expectedValue={proposal.expected_value}
          confidence={proposal.confidence_score}
        />
        {stake !== null && proposal.combined_price !== null && proposal.probability !== null ? (
          <StakeSimulation
            stake={stake}
            price={proposal.combined_price}
            probability={proposal.probability}
          />
        ) : null}
        <p className="text-sm text-muted">
          {proposal.legs_count > 1 ? m.correlationIndependence : m.correlationNone}
        </p>
        <p className="text-xs text-muted">
          {fillTemplate(m.oddsUpdated, { at: formatDateTime(proposal.odds_observed_at) })}
        </p>
        {technical ? (
          <p className="text-xs text-muted">
            {m.model}:{" "}
            {(getMessages().modelIntelligence.modelNames as Record<string, string>)[
              proposal.model_key
            ] ?? proposal.model_key}
            {proposal.rules_version ? ` · ${m.rulesVersion}: ${proposal.rules_version}` : ""} ·{" "}
            {m.generatedAt} {formatDateTime(proposal.created_at)}
          </p>
        ) : null}
        <p className="text-xs text-muted">{m.immutableNote}</p>
      </Card>

      <Card scrollLabel={m.legs} className="mb-4 p-0">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">{m.legs}</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">
                {m.match}
              </th>
              <th scope="col" className="px-4 py-3">
                {m.selection}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                {m.probability}
              </th>
              <th scope="col" className="px-4 py-3">
                {m.confidence}
              </th>
              <th scope="col" className="px-4 py-3">
                {m.bookmaker}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                {m.priceUsed}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                {m.currentPrice}
              </th>
              <th scope="col" className="px-4 py-3">
                {m.freshness}
              </th>
            </tr>
          </thead>
          <tbody>
            {legs.map((l) => (
              <tr key={l.leg_no} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/match-center/${l.match_id}`} className="hover:text-positive">
                    {l.home_team_name} – {l.away_team_name}
                  </Link>
                  <span className="block text-xs text-muted">{formatDateTime(l.kickoff_at)}</span>
                </td>
                <td className="px-4 py-3">
                  {selectionLabel(
                    l.selection,
                    l.home_team_name,
                    l.away_team_name,
                    l.market,
                    l.line,
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatPercent(l.probability)}</td>
                <td className="px-4 py-3">
                  {formatDecimal(l.confidence_score)} · {confidenceLabel(l.confidence_score)}
                </td>
                <td className="px-4 py-3">{l.bookmaker_title}</td>
                <td className="px-4 py-3 text-right font-mono">{formatOdds(l.price)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatOdds(l.current_price)}</td>
                <td className="px-4 py-3">
                  <FreshnessBadge freshness={l.current_freshness} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="max-w-lg">
        <CardTitle className="mb-3">{m.saveSlip}</CardTitle>
        <ActionForm action={saveProposalSlip}>
          <input type="hidden" name="proposalId" value={proposal.id} />
          <Field label={m.slipName} htmlFor="name">
            <Input
              id="name"
              name="name"
              maxLength={80}
              required
              defaultValue={fillTemplate(m.slipNameDefault, {
                date: formatSlateDate(proposal.slate_date),
              })}
            />
          </Field>
          <SubmitButton>{m.saveSlip}</SubmitButton>
        </ActionForm>
      </Card>
      <BetBuilderDisclaimer />
    </>
  );
}
