import type { MatchOddsH2hRow } from "@predictra/shared-types";
import type { ReactNode } from "react";
import { FreshnessBadge, QualityBadge } from "@/components/football/badges";
import { analyseH2h, formatOdds, formatPercent, type Triplet } from "@/lib/odds/format";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { BookmakerKindBadge, MarginBadge } from "./badges";
import { ScrollRegion } from "@/components/ui/primitives";
import { Limited } from "@/components/ui/limited";

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-2 font-medium ${className ?? ""}`}>
      {children}
    </th>
  );
}

function Probabilities({ value }: { value: Triplet | null }) {
  const m = getMessages().marketIntelligence;
  if (!value) return <span className="text-muted">{m.notComputable}</span>;
  return (
    <span className="whitespace-nowrap font-mono text-xs">
      {formatPercent(value.home)} · {formatPercent(value.draw)} · {formatPercent(value.away)}
    </span>
  );
}

/** Quote 1X2 di un gruppo di bookmaker, con margine, probabilità e freschezza per riga. */
export function BookmakerOddsTable({
  rows,
  caption,
}: {
  rows: readonly MatchOddsH2hRow[];
  caption: string;
}) {
  const m = getMessages().marketIntelligence;
  return (
    <ScrollRegion label={caption}>
      <Limited total={rows.length}>
        <table className="w-full min-w-[960px] text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <Th>{m.bookmaker}</Th>
              <Th className="text-right">{m.home}</Th>
              <Th className="text-right">{m.draw}</Th>
              <Th className="text-right">{m.away}</Th>
              <Th>{m.margin}</Th>
              <Th>{m.proportional}</Th>
              <Th>{m.power}</Th>
              <Th>{m.observedAt}</Th>
              <Th>{m.freshness}</Th>
              <Th>{m.quality}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const analysis = analyseH2h(row);
              return (
                <tr key={row.bookmaker} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {row.bookmaker_title}
                      <BookmakerKindBadge italian={row.italian_market} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatOdds(row.home_price)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatOdds(row.draw_price)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatOdds(row.away_price)}</td>
                  <td className="px-3 py-2">
                    {analysis ? <MarginBadge value={analysis.overround} /> : m.notComputable}
                  </td>
                  <td className="px-3 py-2">
                    <Probabilities value={analysis?.proportional ?? null} />
                  </td>
                  <td className="px-3 py-2">
                    <Probabilities value={analysis?.power ?? null} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {formatDateTime(row.observed_at)}
                  </td>
                  <td className="px-3 py-2">
                    <FreshnessBadge freshness={row.freshness} />
                  </td>
                  <td className="px-3 py-2">
                    <QualityBadge quality={row.quality} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Limited>
    </ScrollRegion>
  );
}
