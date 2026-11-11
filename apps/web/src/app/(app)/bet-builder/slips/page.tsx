import type { Metadata } from "next";
import Link from "next/link";
import { EvaluationPanel } from "@/components/bet-builder/evaluation";
import { BetBuilderDisclaimer, BetBuilderNav } from "@/components/bet-builder/shared";
import { SubmitButton } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { evaluateSelections, type ManualSelection } from "@/lib/bet-builder/evaluate";
import { selectionLabel } from "@/lib/bet-builder/format";
import { listManualOptions, listMatches, listSlips } from "@/lib/bet-builder/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { deleteSlip } from "../actions";

export const metadata: Metadata = { title: "Le mie schedine — Smart Bet Builder" };

export default async function SlipsPage() {
  await requireUser();
  const m = getMessages().betBuilder;
  const now = new Date();
  const slips = await listSlips();
  const matchIds = [...new Set(slips.flatMap((s) => s.selections.map((x) => x.match_id)))];
  const [options, matches] = await Promise.all([
    listManualOptions(now, matchIds),
    listMatches(matchIds),
  ]);
  const outcomes = options.flatMap((o) => o.outcomes);

  // Valori sempre ricalcolati con previsioni e quote attuali.
  const current = (matchId: number, market: string, selection: string): ManualSelection => {
    const found =
      market === "1X2"
        ? outcomes.find((o) => o.matchId === matchId && o.selection === selection)
        : undefined;
    if (found) return found;
    const match = matches.get(matchId);
    return {
      matchId,
      homeTeam: match?.home_team_name ?? `#${matchId}`,
      awayTeam: match?.away_team_name ?? "",
      kickoffAt: match?.kickoff_at ?? now.toISOString(),
      selection,
      probability: null,
      confidence: null,
      price: null,
      freshness: null,
    };
  };

  return (
    <>
      <PageHeader title={m.slipsTitle} description={m.slipsDescription} />
      <BetBuilderDisclaimer />
      <BetBuilderNav current="slips" />

      {slips.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{m.slipsEmpty}</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {slips.map((slip) => {
            const selections = slip.selections.map((x) =>
              current(x.match_id, x.market, x.selection),
            );
            return (
              <Card key={slip.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{slip.name}</h2>
                  <span className="text-xs text-muted">
                    {fillTemplate(m.savedAt, { date: formatDateTime(slip.created_at) })}
                  </span>
                </div>
                {slip.source_proposal_id ? (
                  <Link
                    href={`/bet-builder/${slip.source_proposal_id}`}
                    className="text-xs text-positive hover:underline"
                  >
                    {m.fromProposal}
                  </Link>
                ) : null}
                <ul className="flex flex-col gap-1 text-sm">
                  {selections.map((x, i) => (
                    <li key={slip.selections[i]!.id}>
                      {x.homeTeam} – {x.awayTeam} ·{" "}
                      {selectionLabel(x.selection, x.homeTeam, x.awayTeam)} ·{" "}
                      <span className="text-muted">{formatDateTime(x.kickoffAt)}</span>
                    </li>
                  ))}
                </ul>
                <EvaluationPanel evaluation={evaluateSelections(selections, now)} />
                <form action={deleteSlip} className="mt-auto">
                  <input type="hidden" name="slipId" value={slip.id} />
                  <SubmitButton
                    variant="danger"
                    confirmMessage={getMessages().common.confirmDelete}
                  >
                    {m.deleteSlip}
                  </SubmitButton>
                </form>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
