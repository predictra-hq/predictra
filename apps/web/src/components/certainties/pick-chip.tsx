import { pickLabel } from "@/components/bet-builder/likely";
import { Badge } from "@/components/ui/primitives";
import { italianPriceFor, type ItalianPrice } from "@/lib/bet-builder/likely";
import type { Pick } from "@/lib/certainties/logic";
import { getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds } from "@/lib/odds/format";
import { formatFairOdds, formatPercent } from "@/lib/predictions/format";

/** Una giocata delle Certezze: probabilità, quota equa, modello/mercato e quota italiana. */
export function PickChip({
  pick: p,
  prices,
}: {
  pick: Pick;
  prices: ReadonlyMap<string, ItalianPrice>;
}) {
  const c = getMessages().certainties;
  const price = italianPriceFor(prices, p);
  const value = price ? p.probability * price.price - 1 : null;
  return (
    <li className="rounded-md border border-border px-3 py-1.5 text-sm">
      <span>{pickLabel(p)}</span>{" "}
      <span className="font-semibold">{formatPercent(p.probability)}</span>{" "}
      <span className="text-xs text-muted">
        ({c.fairOdds} {formatFairOdds(p.probability)})
      </span>
      {p.marketProbability !== null ? (
        <span className="block text-xs text-muted">
          {fillTemplate(c.split, {
            model: formatPercent(p.modelProbability),
            market: formatPercent(p.marketProbability),
          })}
        </span>
      ) : null}
      {price && value !== null ? (
        <span className="mt-1 flex items-center gap-2 text-xs">
          <span>
            {fillTemplate(c.bestPrice, {
              price: formatOdds(price.price),
              bookmaker: price.bookmaker,
            })}
          </span>
          <Badge tone={value >= 0 ? "positive" : "neutral"}>
            {value >= 0 ? fillTemplate(c.worth, { value: formatPercent(value) }) : c.notWorth}
          </Badge>
        </span>
      ) : null}
    </li>
  );
}
