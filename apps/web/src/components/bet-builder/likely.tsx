import Link from "next/link";
import type { PredictionMarket } from "@predictra/shared-types";
import { CategoryBadge, StakeSimulation } from "@/components/bet-builder/shared";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import {
  bestPicks,
  combinedItalianPrice,
  italianPriceFor,
  likelyMultiples,
  type ItalianPrice,
  type LikelyMultiple,
  type LikelyPick,
} from "@/lib/bet-builder/likely";
import { confidenceLabel, selectionLabel } from "@/lib/bet-builder/format";
import { loadPicksData } from "@/lib/bet-builder/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds } from "@/lib/odds/format";
import { formatFairOdds, formatLine, formatPercent } from "@/lib/predictions/format";

/** "Doppia chance 1X", "Totale gol Under 2,5", "Gol squadra Casa over 0,5". */
export function pickLabel(
  pick: Pick<LikelyPick, "market" | "selection" | "line"> &
    Partial<Pick<LikelyPick, "home" | "away">>,
): string {
  // 1X2 con le squadre: "1 · Manchester City" invece di "Esito finale 1X2 1".
  if (pick.market === "1X2" && pick.home && pick.away) {
    return selectionLabel(pick.selection, pick.home, pick.away);
  }
  const p = getMessages().predictions;
  const market = p.markets[pick.market as PredictionMarket] ?? pick.market;
  const selection = (p.selections as Record<string, string>)[pick.selection] ?? pick.selection;
  const line = formatLine(pick.line, pick.market as PredictionMarket);
  return [market, selection, line].filter(Boolean).join(" ");
}

function marketName(market: string): string {
  const p = getMessages().predictions;
  return p.markets[market as PredictionMarket] ?? market;
}

/** Pronostici di una multipla raggruppati per tipo di giocata, nell'ordine in cui arrivano. */
function groupByMarket(picks: readonly LikelyPick[]): { market: string; picks: LikelyPick[] }[] {
  const groups: { market: string; picks: LikelyPick[] }[] = [];
  for (const pick of picks) {
    const last = groups.at(-1);
    if (last && last.market === pick.market) last.picks.push(pick);
    else groups.push({ market: pick.market, picks: [pick] });
  }
  return groups;
}

type Prices = ReadonlyMap<string, ItalianPrice>;

function PickRow({ pick, prices }: { pick: LikelyPick; prices: Prices }) {
  const m = getMessages().betBuilder.likely;
  const it = italianPriceFor(prices, pick);
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-1.5 last:border-0">
      <span>
        <Link href={`/match-center/${pick.matchId}`} className="font-medium hover:underline">
          {pick.home} – {pick.away}
        </Link>{" "}
        <span className="text-muted">· {formatDateTime(pick.kickoffAt)}</span>
        <span className="block text-sm">{pickLabel(pick)}</span>
      </span>
      <span className="text-right font-mono text-sm">
        {formatPercent(pick.probability)}{" "}
        <span className="text-xs text-muted">({formatFairOdds(pick.probability)})</span>
        {it ? (
          <span className="block text-xs">
            {fillTemplate(m.italianPrice, {
              price: formatOdds(it.price),
              bookmaker: it.bookmaker,
            })}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** Pronostici più probabili per partita e multiple più probabili (solo modello, nessuna quota inventata). */
export function LikelyCard({
  picks,
  multiples,
  prices,
  stake = null,
}: {
  picks: readonly LikelyPick[];
  multiples: readonly LikelyMultiple[];
  prices: Prices;
  /** Puntata da simulare sulle multiple che hanno una quota reale. */
  stake?: number | null;
}) {
  const m = getMessages().betBuilder.likely;
  return (
    <Card className="mb-6">
      <CardTitle>{m.title}</CardTitle>
      <p className="mt-1 text-sm text-muted">{m.description}</p>
      {picks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{m.empty}</p>
      ) : (
        <>
          {multiples.length > 0 ? (
            <>
              <h3 className="mb-2 mt-4 text-sm font-semibold">{m.multiples}</h3>
              <div className="grid gap-3 lg:grid-cols-3">
                {multiples.map((x) => (
                  <div
                    key={x.category}
                    className="rounded-lg border border-border bg-surface-2 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        <CategoryBadge category={x.category} />
                        {fillTemplate(m.multiple, { n: x.size })}
                      </span>
                      <Badge tone="positive">
                        {m.probability} {formatPercent(x.probability)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {m.fairOdds} {formatFairOdds(x.probability)} · {m.confidence}{" "}
                      {confidenceLabel(x.confidence)}
                    </p>
                    {(() => {
                      const real = combinedItalianPrice(prices, x.picks);
                      return real === null ? null : (
                        <>
                          <p className="mt-1 text-xs">
                            {fillTemplate(m.combinedItalian, { price: formatOdds(real) })}
                          </p>
                          {stake !== null ? (
                            <div className="mt-2">
                              <StakeSimulation
                                stake={stake}
                                price={real}
                                probability={x.probability}
                              />
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                    {groupByMarket(x.picks).map((g) => (
                      <div key={g.market} className="mt-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                          {marketName(g.market)} · {g.picks.length}
                        </h4>
                        <ul className="text-sm">
                          {g.picks.map((p) => (
                            <PickRow key={p.matchId} pick={p} prices={prices} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <h3 className="mb-2 mt-5 text-sm font-semibold">{m.singles}</h3>
          <ul className="text-sm">
            {picks.slice(0, 10).map((p) => (
              <PickRow key={p.matchId} pick={p} prices={prices} />
            ))}
          </ul>
          {picks.length > 10 ? (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-positive">
                {fillTemplate(m.showAll, { n: picks.length })}
              </summary>
              <ul className="mt-2">
                {picks.slice(10).map((p) => (
                  <PickRow key={p.matchId} pick={p} prices={prices} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
      <p className="mt-4 text-xs text-muted">{m.fairOddsNote}</p>
    </Card>
  );
}

/** Sezione asincrona: legge previsioni e quote e mostra i pronostici più probabili. */
export async function LikelySection({ stake }: { stake: number | null }) {
  const { rows, prices } = await loadPicksData();
  const picks = bestPicks(rows);
  return (
    <LikelyCard picks={picks} multiples={likelyMultiples(picks)} prices={prices} stake={stake} />
  );
}
