import Link from "next/link";
import type { PredictionMarket } from "@predictra/shared-types";
import { CategoryBadge, StakeSimulation } from "@/components/bet-builder/shared";
import { Ticket, TicketLeg, TicketTotals, whenAndWhere } from "@/components/bet-builder/ticket";
import { Card, CardTitle } from "@/components/ui/primitives";
import { listCompetitions } from "@/lib/football/queries";
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
import { orFallback } from "@/lib/log";
import { inCurrentWindow } from "@/lib/bet-builder/bollette";

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
  competitions = new Map(),
}: {
  /** Nomi dei campionati, mostrati sotto le squadre. */
  competitions?: ReadonlyMap<number, string>;
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
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {multiples.map((x) => {
                  const real = combinedItalianPrice(prices, x.picks);
                  return (
                    <Ticket
                      key={x.category}
                      title={fillTemplate(m.multiple, { n: x.size })}
                      badge={<CategoryBadge category={x.category} />}
                      totals={
                        <TicketTotals
                          priceLabel={real === null ? m.fairOdds : m.realOdds}
                          price={real === null ? formatFairOdds(x.probability) : formatOdds(real)}
                          items={[
                            { label: m.probability, value: formatPercent(x.probability) },
                            { label: m.confidence, value: confidenceLabel(x.confidence) },
                          ]}
                        />
                      }
                      footer={
                        real !== null && stake !== null ? (
                          <StakeSimulation stake={stake} price={real} probability={x.probability} />
                        ) : undefined
                      }
                    >
                      {x.picks.map((p) => {
                        const it = italianPriceFor(prices, p);
                        return (
                          <TicketLeg
                            key={p.matchId}
                            time={whenAndWhere(p, competitions)}
                            match={
                              <Link href={`/match-center/${p.matchId}`} className="hover:underline">
                                {p.home} – {p.away}
                              </Link>
                            }
                            pick={pickLabel(p)}
                            probability={formatPercent(p.probability)}
                            price={
                              it ? (
                                formatOdds(it.price)
                              ) : (
                                <span className="text-muted" title={m.fairOdds}>
                                  {formatFairOdds(p.probability)}
                                </span>
                              )
                            }
                          />
                        );
                      })}
                    </Ticket>
                  );
                })}
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
  const [{ rows, prices }, competitionList] = await Promise.all([
    loadPicksData(),
    listCompetitions().catch(orFallback("bet-builder/likely #1", [])),
  ]);
  // Solo il turno in corso (scelta del proprietario del 27/11/2026).
  const now = new Date();
  const picks = bestPicks(rows.filter((r) => inCurrentWindow(r.kickoff_at, "round", now)));
  return (
    <LikelyCard
      picks={picks}
      multiples={likelyMultiples(picks)}
      prices={prices}
      stake={stake}
      competitions={new Map(competitionList.map((c) => [c.id, c.name]))}
    />
  );
}
