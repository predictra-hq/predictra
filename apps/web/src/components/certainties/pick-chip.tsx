import Link from "next/link";
import { Plus } from "lucide-react";
import type { PredictionMarket } from "@predictra/shared-types";
import { pickLabel } from "@/components/bet-builder/likely";
import { encodeLegs } from "@/lib/bankroll/legs";
import { italianPriceFor, type ItalianPrice } from "@/lib/bet-builder/likely";
import type { Pick } from "@/lib/certainties/logic";
import { getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds } from "@/lib/odds/format";
import { formatPercent } from "@/lib/predictions/format";

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
  const legs = encodeLegs([p]);
  if (legs) params.set("lg", legs);
  return `/tracker?${params.toString()}#bet-event`;
}

/**
 * Una giocata su una riga: nome e quota a sinistra, probabilità a destra, "+" per
 * registrarla tra le giocate fatte. Se la quota paga meno del giusto (probabilità × quota
 * − 1 sotto zero) lo dice: probabile non vuol dire conveniente.
 */
export function PickRow({
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
    <li className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{pickLabel(p)}</span>
        {price ? (
          <span className="block text-xs text-muted" title={price.bookmaker}>
            {fillTemplate(c.priceShort, { price: formatOdds(price.price) })}
            {value !== null && value >= 0 ? (
              <span className="ml-1.5 font-medium text-positive-strong">
                {fillTemplate(c.worth, { value: formatPercent(value, 0) })}
              </span>
            ) : null}
          </span>
        ) : null}
        {value !== null && value < 0 ? (
          <span className="block text-xs text-warning">
            {fillTemplate(c.belowFair, { loss: formatPercent(-value, 0) })}
          </span>
        ) : null}
        {price?.better ? (
          <span className="block text-xs text-warning">
            {fillTemplate(c.betterElsewhere, {
              price: formatOdds(price.better.price),
              bookmaker: price.better.bookmaker,
            })}
          </span>
        ) : null}
      </span>
      <span className="font-mono text-base font-semibold">{formatPercent(p.probability, 0)}</span>
      <Link
        href={trackerHref(p, price)}
        aria-label={`${c.register}: ${p.home} – ${p.away}, ${pickLabel(p)}`}
        title={c.register}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted hover:text-fg active:bg-border"
      >
        <Plus size={16} aria-hidden="true" />
      </Link>
    </li>
  );
}
