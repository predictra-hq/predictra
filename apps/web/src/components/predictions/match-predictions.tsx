import type { ActivePredictionRow, ConfidenceBand } from "@predictra/shared-types";
import { confidenceBand } from "@predictra/shared-types";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import {
  confidenceTone,
  formatFairOdds,
  formatLine,
  formatPercent,
  groupPredictions,
  PRIMARY_MARKETS,
  sortSelections,
  type PredictionGroup,
} from "@/lib/predictions/format";
import { getMatchPredictions } from "@/lib/predictions/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";

type Components = Partial<Record<"sample" | "calibration" | "agreement" | "data", number>>;

function GroupTable({ group }: { group: PredictionGroup }) {
  const m = getMessages().predictions;
  const selections = m.selections as Record<string, string>;
  const hasPush = group.rows.some((r) => r.push_probability !== null);
  const title = `${m.markets[group.market]}${group.line !== null ? ` ${formatLine(group.line, group.market)}` : ""}`;
  return (
    <table className="w-full text-left text-sm">
      <caption className="pb-1 text-left text-xs font-medium uppercase tracking-wide text-muted">
        {title}
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{m.line}</th>
          <th scope="col">{m.probability}</th>
          {hasPush ? <th scope="col">{m.push}</th> : null}
          <th scope="col">{m.fairOdds}</th>
        </tr>
      </thead>
      <tbody>
        {sortSelections(group).map((r) => (
          <tr key={r.selection} className="border-b border-border last:border-0">
            <th scope="row" className="py-1 pr-2 font-medium">
              {selections[r.selection] ?? r.selection}
            </th>
            <td className="py-1 pr-2 text-right font-mono">{formatPercent(r.probability)}</td>
            {hasPush ? (
              <td className="py-1 pr-2 text-right font-mono text-muted">
                {formatPercent(r.push_probability)}
              </td>
            ) : null}
            <td className="py-1 text-right font-mono text-muted">
              {formatFairOdds(r.probability)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Pannello "Previsioni PREDICTRA" del dettaglio partita: solo il modello attivo (v_active_predictions). */
export async function MatchPredictions({ matchId }: { matchId: number }) {
  const m = getMessages();
  const p = m.predictions;
  const rows: ActivePredictionRow[] = await getMatchPredictions(matchId);

  if (rows.length === 0) {
    return (
      <Card className="mt-4">
        <CardTitle>{p.title}</CardTitle>
        <p className="mt-2 text-sm text-muted">{p.noPredictions}</p>
      </Card>
    );
  }

  const first = rows[0]!;
  const score = Number(first.confidence_score);
  const band: ConfidenceBand = confidenceBand(score);
  const oneXTwo = rows.find((r) => r.market === "1X2");
  const components = ((oneXTwo?.explanation?.confidence ?? {}) as Components) || {};
  const groups = groupPredictions(rows);
  const primary = groups.filter((g) => PRIMARY_MARKETS.includes(g.market));
  const others = groups.filter((g) => !PRIMARY_MARKETS.includes(g.market));

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{p.title}</CardTitle>
        <Badge tone={confidenceTone(score)}>
          {p.confidence}: {score.toFixed(2).replace(".", ",")} ({p.confidenceBand[band]})
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {p.modelVersion}: {m.modelIntelligence.modelNames[first.model_key]} ({first.model_version})
        · {p.asOf} {formatDateTime(first.as_of)}
      </p>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(Object.keys(p.components) as (keyof typeof p.components)[]).map((k) => (
          <div key={k} className="flex gap-1">
            <dt>{p.components[k]}</dt>
            <dd className="font-mono">
              {components[k] === undefined ? "–" : Number(components[k]).toFixed(2)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {primary.map((g) => (
          <GroupTable key={`${g.market}-${g.line}`} group={g} />
        ))}
      </div>

      {others.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">{p.otherMarkets}</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((g) => (
              <GroupTable key={`${g.market}-${g.line}`} group={g} />
            ))}
          </div>
        </details>
      ) : null}

      <p className="mt-4 text-xs text-subtle">{p.disclaimer}</p>
    </Card>
  );
}
