import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";
import {
  movementDirection,
  oddsMovement,
  sparklinePoints,
  type MovementDirection,
} from "@/lib/odds/movement";
import { listMatchOddsHistory } from "@/lib/odds/queries";
import { cn } from "@/lib/utils";

const SELECTIONS = ["HOME", "DRAW", "AWAY"] as const;
const CHART = { width: 96, height: 24 };

const DIRECTION_ICON = { down: ArrowDownRight, up: ArrowUpRight, flat: Minus };
// Quota in calo: il mercato ci crede di più. Non è "bene" o "male": colori neutri, con testo.
const DIRECTION_TONE: Record<MovementDirection, string> = {
  down: "text-positive-strong",
  up: "text-warning",
  flat: "text-muted",
};

/**
 * Movimento delle quote 1X2 dalla prima raccolta a oggi (media dei bookmaker raccolti).
 * Se le raccolte non bastano a vedere un movimento il riquadro non compare.
 */
export async function OddsMovementCard({ matchId }: { matchId: number }) {
  const m = getMessages().oddsMovement;
  const selections = getMessages().predictions.selections as Record<string, string>;
  const points = await listMatchOddsHistory(matchId).catch(() => []);
  const rows = oddsMovement(points, SELECTIONS);
  if (rows.length === 0 || rows.every((r) => r.series.length < 2)) return null;

  return (
    <Card className="mt-4">
      <CardTitle>{m.title}</CardTitle>
      <p className="mt-1 text-xs text-muted">
        {fillTemplate(m.basis, { n: Math.max(...rows.map((r) => r.bookmakers)) })}
      </p>
      <table className="compact-sm mt-3 w-full text-left text-sm">
        <caption className="sr-only">{m.title}</caption>
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th scope="col" className="py-2 font-medium">
              {m.outcome}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {m.open}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {m.now}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {m.change}
            </th>
            <th scope="col" className="hidden py-2 pl-3 font-medium sm:table-cell">
              <span className="sr-only">{m.trend}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const direction = movementDirection(r.change);
            const Icon = DIRECTION_ICON[direction];
            const line = sparklinePoints(r.series, CHART.width, CHART.height);
            return (
              <tr key={r.selection} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 font-medium">
                  {selections[r.selection] ?? r.selection}
                </th>
                <td className="py-2 text-right font-mono text-muted">{formatOdds(r.open)}</td>
                <td className="py-2 text-right font-mono font-semibold">{formatOdds(r.last)}</td>
                <td className={cn("py-2 text-right", DIRECTION_TONE[direction])}>
                  <span className="inline-flex items-center justify-end gap-1">
                    <Icon size={14} aria-hidden="true" />
                    <span className="font-mono">
                      {r.change > 0 ? "+" : r.change < 0 ? "−" : ""}
                      {formatPercent(Math.abs(r.change))}
                    </span>
                    <span className="sr-only">{m.directions[direction]}</span>
                  </span>
                </td>
                <td className="hidden py-2 pl-3 sm:table-cell">
                  {line ? (
                    <svg
                      aria-hidden="true"
                      viewBox={`-2 -2 ${CHART.width + 4} ${CHART.height + 4}`}
                      className={cn("h-6 w-24", DIRECTION_TONE[direction])}
                    >
                      <polyline
                        points={line}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-subtle">{m.note}</p>
    </Card>
  );
}
