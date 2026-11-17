import { Check, X } from "lucide-react";
import { pickLabel } from "@/components/bet-builder/likely";
import { Card, CardTitle } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { formatPercent } from "@/lib/predictions/format";
import { getPreKickoffPredictions } from "@/lib/predictions/queries";
import { matchVerdicts } from "@/lib/predictions/verdict";

/**
 * Partita finita: cosa diceva il modello prima del calcio d'inizio e cosa è uscito.
 * Nessun riquadro se la partita non è finita o non aveva previsioni.
 */
export async function PredictionVsResult({
  matchId,
  status,
  score,
  home,
  away,
}: {
  matchId: number;
  status: string;
  score: { home: number | null; away: number | null };
  home: string;
  away: string;
}) {
  if (status !== "FINISHED" || score.home === null || score.away === null) return null;
  const rows = await getPreKickoffPredictions(matchId).catch(() => []);
  const verdicts = matchVerdicts(rows, { home: score.home, away: score.away });
  if (verdicts.length === 0) return null;
  const m = getMessages().predictions;
  const hits = verdicts.filter((v) => v.won === true).length;
  const settled = verdicts.filter((v) => v.won !== null).length;
  return (
    <Card className="mb-4">
      <CardTitle>{m.verdictTitle}</CardTitle>
      <p className="mt-1 text-sm text-muted">
        {fillTemplate(m.verdictSummary, { hits: String(hits), count: String(settled) })}
      </p>
      <ul className="mt-3 divide-y divide-border">
        {verdicts.map((v) => (
          <li
            key={`${v.market}|${v.line ?? ""}`}
            className="flex items-center justify-between gap-3 py-2.5 text-sm"
          >
            <span className="min-w-0">
              <span className="block truncate">
                {pickLabel({ market: v.market, line: v.line, selection: v.selection, home, away })}
              </span>
              <span className="block text-xs text-muted">
                {fillTemplate(m.verdictGiven, { p: formatPercent(v.probability, 0) })}
              </span>
            </span>
            {v.won === null ? null : v.won ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-positive/15 px-2.5 py-1 text-xs font-medium text-positive-strong">
                <Check size={14} aria-hidden="true" />
                {m.verdictWon}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-negative/15 px-2.5 py-1 text-xs font-medium text-negative-strong">
                <X size={14} aria-hidden="true" />
                {m.verdictLost}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-subtle">{m.verdictNote}</p>
    </Card>
  );
}
