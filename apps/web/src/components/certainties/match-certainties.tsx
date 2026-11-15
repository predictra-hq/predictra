import { PickChip } from "@/components/certainties/pick-chip";
import { Card, CardTitle } from "@/components/ui/primitives";
import { marketConsensus } from "@/lib/bet-builder/bollette";
import { bestItalianPrices } from "@/lib/bet-builder/likely";
import { listLatestOdds } from "@/lib/bet-builder/queries";
import { marketLookup } from "@/lib/certainties/load";
import { selectPicks } from "@/lib/certainties/logic";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { formatPercent } from "@/lib/predictions/format";
import { getMatchPredictions } from "@/lib/predictions/queries";

/** Soglia delle certezze nel dettaglio partita: la più bassa della pagina Certezze. */
const MATCH_THRESHOLD = 0.7;

/**
 * Le giocate più probabili di una partita non ancora iniziata, in cima al dettaglio.
 * Nessun riquadro se non ce ne sono (le previsioni complete restano più sotto).
 */
export async function MatchCertainties({ matchId, status }: { matchId: number; status: string }) {
  if (status !== "SCHEDULED") return null;
  const c = getMessages().certainties;
  const data = await Promise.all([getMatchPredictions(matchId), listLatestOdds([matchId])]).catch(
    () => null,
  );
  if (!data) return null;
  const [rows, odds] = data;
  const picks = selectPicks(rows, MATCH_THRESHOLD, marketLookup(marketConsensus(odds))).sort(
    (a, b) => b.probability - a.probability,
  );
  if (picks.length === 0) return null;
  const prices = bestItalianPrices(odds);
  return (
    <Card className="mb-4">
      <CardTitle>
        {fillTemplate(c.matchTitle, { value: formatPercent(MATCH_THRESHOLD, 0) })}
      </CardTitle>
      <ul className="mt-3 flex flex-wrap gap-2">
        {picks.map((p) => (
          <PickChip key={`${p.market}|${p.line ?? ""}|${p.selection}`} pick={p} prices={prices} />
        ))}
      </ul>
    </Card>
  );
}
