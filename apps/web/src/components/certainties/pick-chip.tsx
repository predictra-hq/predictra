import Link from "next/link";
import type { PredictionMarket } from "@predictra/shared-types";
import { pickLabel } from "@/components/bet-builder/likely";
import { Badge } from "@/components/ui/primitives";
import { italianPriceFor, type ItalianPrice } from "@/lib/bet-builder/likely";
import type { Pick } from "@/lib/certainties/logic";
import { getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds } from "@/lib/odds/format";
import { formatFairOdds, formatPercent } from "@/lib/predictions/format";

/** Link al modulo "Aggiungi giocata" del Tracker, già compilato con questa giocata. */
export function trackerHref(p: Pick, price: ItalianPrice | null): string {
  const m = getMessages().predictions;
  const params = new URLSearchParams({
    add: "1",
    d: `${p.home} – ${p.away}`,
    mk: m.markets[p.market as PredictionMarket] ?? p.market,
    sel: (m.selections as Record<string, string>)[p.selection] ?? p.selection,
  });
  if (p.line !== null) params.set("ln", String(p.line));
  if (price) {
    params.set("o", price.price.toFixed(2));
    params.set("bk", price.bookmaker);
  }
  return `/tracker?${params.toString()}#bet-event`;
}

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
  // Dettaglio modello/mercato solo al passaggio del mouse: la riga resta corta.
  const detail =
    p.marketProbability !== null
      ? fillTemplate(c.split, {
          model: formatPercent(p.modelProbability),
          market: formatPercent(p.marketProbability),
        })
      : undefined;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border px-3 py-1.5 text-sm">
      <span>{pickLabel(p)}</span>
      <span className="font-semibold" title={detail}>
        {formatPercent(p.probability, 0)}
      </span>
      {price && value !== null ? (
        <span className="text-xs text-muted" title={price.bookmaker}>
          {fillTemplate(c.priceShort, { price: formatOdds(price.price) })}
          {value >= 0 ? (
            <Badge tone="positive" className="ml-1">
              {fillTemplate(c.worth, { value: formatPercent(value, 0) })}
            </Badge>
          ) : null}
        </span>
      ) : (
        <span className="text-xs text-muted">
          {fillTemplate(c.fairShort, { price: formatFairOdds(p.probability) })}
        </span>
      )}
      <Link
        href={trackerHref(p, price)}
        className="text-xs text-muted underline underline-offset-2 hover:text-fg"
      >
        {c.register}
      </Link>
    </li>
  );
}
