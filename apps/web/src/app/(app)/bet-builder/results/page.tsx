import { BET_PROPOSAL_CATEGORIES } from "@predictra/shared-types";
import type { Metadata } from "next";
import Link from "next/link";
import {
  BetBuilderDisclaimer,
  BetBuilderNav,
  CategoryBadge,
} from "@/components/bet-builder/shared";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { parseCategory } from "@/lib/bet-builder/format";
import { listPastProposals } from "@/lib/bet-builder/queries";
import {
  MIN_SAMPLE,
  settleProposals,
  summarize,
  type ProposalOutcome,
  type ResultsSummary,
} from "@/lib/bet-builder/results";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent, formatSigned } from "@/lib/odds/format";

export const metadata: Metadata = { title: "Risultati — Schedine" };

const OUTCOME_TONE: Record<ProposalOutcome, "positive" | "negative" | "neutral"> = {
  WON: "positive",
  LOST: "negative",
  PENDING: "neutral",
};

/** Quante proposte chiuse mostrare nell'elenco. */
const LIST_LIMIT = 30;

function SummaryRow({ label, s }: { label: string; s: ResultsSummary }) {
  const profitClass =
    s.settled === 0 ? "" : s.profit >= 0 ? "text-positive-strong" : "text-negative-strong";
  return (
    <tr className="border-b border-border last:border-0">
      <th scope="row" className="px-4 py-3 text-left font-medium">
        {label}
      </th>
      <td className="px-4 py-3 text-right font-mono">{s.settled}</td>
      <td className="px-4 py-3 text-right font-mono">{s.won}</td>
      <td className="px-4 py-3 text-right font-mono">{formatPercent(s.hitRate)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatPercent(s.expectedHitRate)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatOdds(s.averagePrice)}</td>
      <td className={`px-4 py-3 text-right font-mono ${profitClass}`}>
        {s.settled === 0 ? "—" : formatSigned(s.profit)}
      </td>
      <td className={`px-4 py-3 text-right font-mono ${profitClass}`}>{formatPercent(s.yield)}</td>
    </tr>
  );
}

/**
 * Risultati delle proposte passate: quante sono uscite e quanto avrebbero reso a
 * puntata fissa, alle quote salvate. Serve a capire se il modello guadagna davvero.
 */
export default async function BetBuilderResultsPage() {
  await requireUser();
  const m = getMessages().betBuilder;
  const r = m.results;
  const { proposals, scores } = await listPastProposals(new Date());
  const settled = settleProposals(proposals, scores);
  const total = summarize(settled);
  const closed = settled.filter((p) => p.outcome !== "PENDING");

  return (
    <>
      <PageHeader title={r.title} description={r.description} />
      <BetBuilderNav current="results" />

      {settled.length === 0 ? (
        <EmptyState>{r.empty}</EmptyState>
      ) : (
        <>
          {total.settled < MIN_SAMPLE ? (
            <Alert tone="warning" className="mb-4">
              {fillTemplate(r.smallSample, { n: total.settled, min: MIN_SAMPLE })}
            </Alert>
          ) : null}

          <Card scrollLabel={r.title} className="mb-6 p-0">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{r.title}</caption>
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    {m.category}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {r.settled}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {r.won}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {r.hitRate}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {r.expectedHitRate}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {r.averagePrice}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {r.profit}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {r.yield}
                  </th>
                </tr>
              </thead>
              <tbody>
                {BET_PROPOSAL_CATEGORIES.map((c) => (
                  <SummaryRow
                    key={c}
                    label={m.categories[c]}
                    s={summarize(settled.filter((p) => p.category === c))}
                  />
                ))}
                <SummaryRow label={r.total} s={total} />
              </tbody>
            </table>
          </Card>
          <p className="mb-6 text-xs text-muted">
            {r.help}
            {total.pending > 0 ? ` ${fillTemplate(r.pendingNote, { n: total.pending })}` : ""}
          </p>

          <h2 className="mb-3 text-lg font-semibold">{r.latest}</h2>
          {closed.length === 0 ? (
            <EmptyState>{r.noneClosed}</EmptyState>
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {closed.slice(0, LIST_LIMIT).map((p) => {
                const category = parseCategory(p.category);
                const legs = fillTemplate(r.legs, { n: p.legs.length });
                const meta = `${legs} · ${formatDateTime(p.last_kickoff_at)}`;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/bet-builder/${p.id}`}
                      className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Card className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-positive/40">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone={OUTCOME_TONE[p.outcome]}>{r.outcomes[p.outcome]}</Badge>
                          {category ? <CategoryBadge category={category} /> : null}
                          <span className="text-sm text-muted">{meta}</span>
                        </span>
                        <span className="text-right font-mono text-sm">
                          {m.price} {formatOdds(p.combined_price)}
                          <span className="block text-xs text-muted">
                            {m.probability} {formatPercent(p.probability)}
                          </span>
                        </span>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <BetBuilderDisclaimer />
    </>
  );
}
