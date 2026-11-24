import { Check, Circle, X } from "lucide-react";
import { pickLabel } from "@/components/bet-builder/likely";
import type { BetLeg } from "@/lib/bankroll/legs";
import type { BetLegMatch } from "@/lib/bankroll/queries";
import { settle } from "@/lib/certainties/logic";
import { formatDateTime } from "@/lib/i18n";

/**
 * Schedina di una giocata registrata (ADR 0070): si apre sotto la riga e mostra ogni
 * partita, l'esito giocato, il risultato e se è uscito.
 */
export function BetSlipDetails({
  legs,
  matches,
  labels,
}: {
  legs: readonly BetLeg[];
  matches: ReadonlyMap<number, BetLegMatch>;
  labels: { show: string; won: string; lost: string; pending: string };
}) {
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer font-medium text-positive-strong hover:underline">
        {labels.show.replace("{n}", String(legs.length))}
      </summary>
      <ul className="mt-2 flex flex-col divide-y divide-dotted divide-border rounded-lg border border-border bg-surface-2 px-3">
        {legs.map((l) => {
          const m = matches.get(l.m);
          const done = m && m.status === "FINISHED" && m.homeScore !== null && m.awayScore !== null;
          const won = done ? settle(l.k as never, l.l, l.s, m.homeScore!, m.awayScore!) : null;
          return (
            <li key={`${l.m}-${l.k}-${l.s}`} className="flex items-center gap-3 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg">
                  {m ? `${m.home} – ${m.away}` : `#${l.m}`}
                </p>
                <p className="text-muted">
                  {pickLabel({
                    market: l.k,
                    selection: l.s,
                    line: l.l,
                    home: m?.home,
                    away: m?.away,
                  })}
                  {m ? ` · ${formatDateTime(m.kickoffAt)}` : ""}
                </p>
              </div>
              {done ? (
                <span className="font-mono tabular-nums text-muted">
                  {m.homeScore}-{m.awayScore}
                </span>
              ) : null}
              {won === true ? (
                <Check size={16} className="text-positive-strong" aria-label={labels.won} />
              ) : won === false ? (
                <X size={16} className="text-negative-strong" aria-label={labels.lost} />
              ) : (
                <Circle size={12} className="text-subtle" aria-label={labels.pending} />
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
