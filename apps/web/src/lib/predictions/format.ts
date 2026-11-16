import {
  type MatchStatus,
  confidenceBand,
  type ActivePredictionRow,
  type ConfidenceBand,
  type ModelStatus,
  type PredictionMarket,
} from "@predictra/shared-types";

export type Tone = "neutral" | "positive" | "negative" | "warning";

/** Linee del totale gol mostrate subito; le altre (estreme o con rimborso) sono in "Altri mercati". */
export const PRIMARY_TOTAL_LINES: readonly number[] = [1.5, 2.5, 3.5];

/** Vero se il gruppo va mostrato subito e non in "Altri mercati". */
export function isPrimaryGroup(group: { market: PredictionMarket; line: number | null }): boolean {
  if (!PRIMARY_MARKETS.includes(group.market)) return false;
  if (group.market === "TOTAL_GOALS") return PRIMARY_TOTAL_LINES.includes(group.line ?? -1);
  return group.market !== "DNB";
}

/** Mercati mostrati subito; gli altri finiscono in "Altri mercati". */
export const PRIMARY_MARKETS: readonly PredictionMarket[] = [
  "1X2",
  "DOUBLE_CHANCE",
  "DNB",
  "TOTAL_GOALS",
  "BTTS",
];

const MARKET_ORDER: readonly PredictionMarket[] = [
  "1X2",
  "DOUBLE_CHANCE",
  "DNB",
  "TOTAL_GOALS",
  "BTTS",
  "TEAM_GOALS",
  "CORRECT_SCORE",
  "EUROPEAN_HANDICAP",
  "ASIAN_HANDICAP",
];

export interface PredictionGroup {
  market: PredictionMarket;
  line: number | null;
  rows: ActivePredictionRow[];
}

/** Raggruppa le previsioni per mercato e linea, in ordine di mercato e di linea. */
export function groupPredictions(rows: readonly ActivePredictionRow[]): PredictionGroup[] {
  const groups = new Map<string, PredictionGroup>();
  for (const row of rows) {
    const line = row.line === null ? null : Number(row.line);
    const key = `${row.market}|${line ?? ""}`;
    const group = groups.get(key) ?? { market: row.market, line, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      MARKET_ORDER.indexOf(a.market) - MARKET_ORDER.indexOf(b.market) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}

/** 0.4567 → "45,7%" */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "–";
  return `${(Number(value) * 100).toFixed(digits).replace(".", ",")}%`;
}

/** Quota equa 1/p con due decimali; "–" se la probabilità è nulla. */
export function formatFairOdds(probability: number): string {
  const p = Number(probability);
  return p > 0 ? (1 / p).toFixed(2).replace(".", ",") : "–";
}

/** Linea con segno per gli handicap: 2.5 → "2,5"; -0.5 → "−0,5"; 1 (handicap) → "+1". */
export function formatLine(line: number | null, market: PredictionMarket): string {
  if (line === null) return "";
  const handicap = market === "EUROPEAN_HANDICAP" || market === "ASIAN_HANDICAP";
  const abs = Math.abs(line).toString().replace(".", ",");
  if (!handicap) return abs;
  if (line === 0) return "0";
  return `${line > 0 ? "+" : "−"}${abs}`;
}

/** Ordine naturale di lettura: 1, X, 2 e Over prima di Under. */
const SELECTION_ORDER = [
  "HOME",
  "DRAW",
  "AWAY",
  "HOME_DRAW",
  "HOME_AWAY",
  "DRAW_AWAY",
  "OVER",
  "UNDER",
  "YES",
  "NO",
];

/**
 * Ordina le selezioni: 1-X-2 e simili nell'ordine in cui si leggono su una schedina,
 * il risultato esatto per probabilità decrescente (OTHER in fondo).
 */
export function sortSelections(group: PredictionGroup): ActivePredictionRow[] {
  if (group.market !== "CORRECT_SCORE") {
    const rank = (sel: string) => {
      const i = SELECTION_ORDER.indexOf(sel);
      return i === -1 ? SELECTION_ORDER.length : i;
    };
    return [...group.rows].sort((a, b) => rank(a.selection) - rank(b.selection));
  }
  return [...group.rows].sort((a, b) =>
    a.selection === "OTHER"
      ? 1
      : b.selection === "OTHER"
        ? -1
        : Number(b.probability) - Number(a.probability),
  );
}

export function confidenceTone(score: number): Tone {
  const band: ConfidenceBand = confidenceBand(score);
  return band === "HIGH" ? "positive" : band === "MEDIUM" ? "warning" : "negative";
}

export function modelStatusTone(status: ModelStatus): Tone {
  return status === "ACTIVE" ? "positive" : status === "RETIRED" ? "neutral" : "warning";
}

/** Differenza percentuale rispetto alla baseline: negativa = migliore (Brier e Log Loss). */
export function relativeDelta(value: number | null, baseline: number | null): number | null {
  if (value === null || baseline === null || Number(baseline) === 0) return null;
  return (Number(value) - Number(baseline)) / Number(baseline);
}

export type EmptyReason = "NO_ACTIVE_MODEL" | "NOT_UPCOMING" | "NOT_YET_EVALUATED";

/** Perché il pannello delle previsioni è vuoto (le previsioni esistono solo per partite non iniziate). */
export function emptyPredictionsReason(input: {
  hasActiveModel: boolean;
  status: MatchStatus;
  kickoffAt: string;
  now?: Date;
}): EmptyReason {
  if (!input.hasActiveModel) return "NO_ACTIVE_MODEL";
  const now = input.now ?? new Date();
  if (input.status !== "SCHEDULED" || new Date(input.kickoffAt) <= now) return "NOT_UPCOMING";
  return "NOT_YET_EVALUATED";
}
