import { DEFAULT_BET_BUILDER_RULES } from "@predictra/shared-types";
import { Alert } from "@/components/ui/primitives";
import type { Evaluation } from "@/lib/bet-builder/evaluate";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { CategoryBadge, Metrics } from "./shared";

/** Risultato della valutazione di una combinazione con avvisi (fase B3). */
export function EvaluationPanel({ evaluation }: { evaluation: Evaluation }) {
  const m = getMessages().betBuilder;
  if (evaluation.legs === 0) return <p className="text-sm text-muted">{m.noSelection}</p>;
  return (
    <div className="flex flex-col gap-3">
      {evaluation.category ? (
        <div>
          <CategoryBadge category={evaluation.category} />
        </div>
      ) : null}
      {evaluation.modellable ? (
        <Metrics
          probability={evaluation.probability}
          price={evaluation.price}
          expectedValue={evaluation.expectedValue}
          confidence={evaluation.confidence}
          compact
        />
      ) : (
        <Alert tone="negative">{m.notModellable}</Alert>
      )}
      {evaluation.meetsRules ? <Alert tone="positive">{m.meetsRules}</Alert> : null}
      {evaluation.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {evaluation.warnings.map((w) => (
            <li key={w}>
              <Alert tone="warning">
                {fillTemplate(m.warnings[w], { legs: DEFAULT_BET_BUILDER_RULES.max_legs })}
              </Alert>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted">{m.correlationIndependence}</p>
    </div>
  );
}
