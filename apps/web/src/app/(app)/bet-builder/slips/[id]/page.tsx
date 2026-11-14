import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvaluationPanel } from "@/components/bet-builder/evaluation";
import { BetBuilderDisclaimer, BetBuilderNav } from "@/components/bet-builder/shared";
import { SubmitButton } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { evaluateSelections } from "@/lib/bet-builder/evaluate";
import { selectionLabel } from "@/lib/bet-builder/format";
import { loadSlipViews } from "@/lib/bet-builder/slip-view";
import { parseId } from "@/lib/football/format";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";
import { deleteSlip } from "../../actions";

export const metadata: Metadata = { title: "Schedina — Schedine" };

export default async function SlipPage({ params }: PageProps<"/bet-builder/slips/[id]">) {
  await requireUser();
  const m = getMessages().betBuilder;
  const { id } = await params;
  const slipId = parseId(id);
  if (slipId === null) notFound();
  const now = new Date();
  // RLS: si trova solo una schedina dell'utente.
  const [view] = await loadSlipViews(now, slipId);
  if (!view) notFound();
  const { slip, selections } = view;

  return (
    <>
      <PageHeader
        title={slip.name}
        description={fillTemplate(m.savedAt, { date: formatDateTime(slip.created_at) })}
      />
      <BetBuilderDisclaimer />
      <BetBuilderNav current="slips" />
      <Link
        href="/bet-builder/slips"
        className="mb-4 inline-block text-sm text-positive hover:underline"
      >
        {m.backToSlips}
      </Link>

      <Card className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2 text-sm">
          {selections.map((x, i) => (
            <li
              key={slip.selections[i]!.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0"
            >
              <span>
                <Link href={`/match-center/${x.matchId}`} className="font-medium hover:underline">
                  {x.homeTeam} – {x.awayTeam}
                </Link>{" "}
                <span className="text-muted">· {formatDateTime(x.kickoffAt)}</span>
                <span className="block">
                  {selectionLabel(
                    x.selection,
                    x.homeTeam,
                    x.awayTeam,
                    slip.selections[i]!.market,
                    slip.selections[i]!.line,
                  )}
                </span>
              </span>
              <span className="font-mono text-xs text-muted">
                {formatPercent(x.probability)} · {formatOdds(x.price)}
              </span>
            </li>
          ))}
        </ul>
        <EvaluationPanel evaluation={evaluateSelections(selections, now)} />
        {slip.source_proposal_id ? (
          <Link
            href={`/bet-builder/${slip.source_proposal_id}`}
            className="text-xs text-positive hover:underline"
          >
            {m.fromProposal}
          </Link>
        ) : null}
        <form action={deleteSlip}>
          <input type="hidden" name="slipId" value={slip.id} />
          <SubmitButton variant="danger" confirmMessage={getMessages().common.confirmDelete}>
            {m.deleteSlip}
          </SubmitButton>
        </form>
      </Card>
    </>
  );
}
