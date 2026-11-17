import type { ActivePredictionRow, PredictionMarket } from "@predictra/shared-types";
import { settle } from "@/lib/certainties/logic";

/*
 * "Cosa diceva il modello": per una partita finita, l'esito più probabile di ogni mercato
 * principale secondo l'ultima previsione prima del calcio d'inizio, e se è uscito.
 * Funzioni pure, testate in verdict.test.ts.
 */

export interface Verdict {
  market: PredictionMarket;
  line: number | null;
  selection: string;
  probability: number;
  /** `null` se il mercato non si risolve con il risultato al 90'. */
  won: boolean | null;
}

/** Mercati mostrati, nell'ordine: esito finale, doppia chance, più/meno 2,5 gol, entrambe segnano. */
const SHOWN: { market: PredictionMarket; line: number | null }[] = [
  { market: "1X2", line: null },
  { market: "DOUBLE_CHANCE", line: null },
  { market: "TOTAL_GOALS", line: 2.5 },
  { market: "BTTS", line: null },
];

export function matchVerdicts(
  rows: readonly ActivePredictionRow[],
  score: { home: number; away: number },
): Verdict[] {
  const out: Verdict[] = [];
  for (const { market, line } of SHOWN) {
    const options = rows.filter(
      (r) => r.market === market && (line === null ? r.line === null : Number(r.line) === line),
    );
    const best = options.reduce<ActivePredictionRow | null>(
      (top, r) => (!top || Number(r.probability) > Number(top.probability) ? r : top),
      null,
    );
    if (!best) continue;
    out.push({
      market,
      line,
      selection: best.selection,
      probability: Number(best.probability),
      won: settle(market, line, best.selection, score.home, score.away),
    });
  }
  return out;
}
