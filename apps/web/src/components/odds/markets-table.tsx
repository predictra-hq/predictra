import { Card } from "@/components/ui/primitives";
import { MARKET_CATALOG, marketAvailability } from "@/lib/odds/markets";
import { getMessages } from "@/lib/i18n";
import { MarketAvailabilityBadge } from "./badges";

/**
 * Stato di ogni mercato (B4, ADR 0005): disponibile solo con quote reali,
 * altrimenti "quote non raccolte" o "non valutabile", sempre con il motivo.
 */
export function MarketsTable({
  collectedCodes,
  eventsWithOdds,
}: {
  collectedCodes: ReadonlySet<string>;
  eventsWithOdds: number;
}) {
  const m = getMessages().marketIntelligence;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">{m.marketsTitle}</caption>
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-4 py-3">
              {m.market}
            </th>
            <th scope="col" className="px-4 py-3">
              {m.availability}
            </th>
            <th scope="col" className="px-4 py-3">
              {m.reason}
            </th>
          </tr>
        </thead>
        <tbody>
          {MARKET_CATALOG.map((market) => {
            const status = marketAvailability(market, collectedCodes, eventsWithOdds);
            return (
              <tr key={market.key} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-3">{m.marketNames[market.key]}</td>
                <td className="px-4 py-3">
                  <MarketAvailabilityBadge status={status} />
                </td>
                <td className="px-4 py-3 text-muted">{m.reasons[status]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
