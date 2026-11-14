import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BetBuilderDisclaimer, BetBuilderNav } from "@/components/bet-builder/shared";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { evaluateSelections } from "@/lib/bet-builder/evaluate";
import { loadSlipViews } from "@/lib/bet-builder/slip-view";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatPercent } from "@/lib/odds/format";

export const metadata: Metadata = { title: "Le mie schedine" };

export default async function SlipsPage() {
  await requireUser();
  const m = getMessages().betBuilder;
  const now = new Date();
  const views = await loadSlipViews(now);

  return (
    <>
      <PageHeader title={m.slipsTitle} description={m.slipsDescription} />
      <BetBuilderDisclaimer />
      <BetBuilderNav current="slips" />

      {views.length === 0 ? (
        <EmptyState>{m.slipsEmpty}</EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {views.map(({ slip, selections }) => {
            const evaluation = evaluateSelections(selections, now);
            return (
              <li key={slip.id}>
                {/* Tutta la scheda è il link al dettaglio della schedina. */}
                <Link
                  href={`/bet-builder/slips/${slip.id}`}
                  className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Card className="flex items-center gap-3 transition-colors hover:border-positive/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{slip.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {fillTemplate(m.slipSummary, { n: selections.length })} ·{" "}
                        {fillTemplate(m.savedAt, { date: formatDateTime(slip.created_at) })}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted">
                        {selections.map((x) => `${x.homeTeam} – ${x.awayTeam}`).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted">{m.slipProbability}</p>
                      <p className="font-mono">{formatPercent(evaluation.probability)}</p>
                    </div>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
                    <span className="sr-only">{m.openSlip}</span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
