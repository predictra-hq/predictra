import type { ActivePredictionRow, PredictionMarket } from "@predictra/shared-types";

/*
 * Certezze: le giocate a probabilità alta del modello attivo, su tutti i mercati con esito
 * secco (niente rimborso). Le probabilità sono quelle del motore (regola 5): qui si
 * filtrano, si tolgono i doppioni e si verifica quante volte la stessa fascia è uscita.
 */

/** Mercati con esito secco, sempre risolvibili dal risultato al 90'. */
export const CERTAINTY_MARKETS: readonly PredictionMarket[] = [
  "1X2",
  "DOUBLE_CHANCE",
  "TOTAL_GOALS",
  "BTTS",
  "TEAM_GOALS",
];

export const THRESHOLDS = [0.7, 0.75, 0.8, 0.85, 0.9] as const;
export const DEFAULT_THRESHOLD = 0.75;

/** Fasce della verifica: [da, a). L'ultima comprende il 100%. */
export const BANDS: readonly (readonly [number, number])[] = [
  [0.7, 0.75],
  [0.75, 0.8],
  [0.8, 0.85],
  [0.85, 0.9],
  [0.9, 1.0001],
];

export interface Pick {
  matchId: number;
  kickoffAt: string;
  home: string;
  away: string;
  market: PredictionMarket;
  line: number | null;
  selection: string;
  probability: number;
  confidence: number;
}

/** Soglia dalla query string (`?soglia=80`); valori non previsti → predefinita. */
export function parseThreshold(value: unknown): number {
  const n = Number(Array.isArray(value) ? value[0] : value) / 100;
  return (THRESHOLDS as readonly number[]).find((t) => Math.abs(t - n) < 1e-9) ?? DEFAULT_THRESHOLD;
}

function isEligible(row: ActivePredictionRow): boolean {
  if (!CERTAINTY_MARKETS.includes(row.market)) return false;
  // Le linee intere hanno il rimborso: restano fuori.
  if (row.line !== null && Number.isInteger(Number(row.line))) return false;
  return true;
}

export function toPick(row: ActivePredictionRow): Pick {
  return {
    matchId: row.match_id,
    kickoffAt: row.kickoff_at,
    home: row.home_team_name,
    away: row.away_team_name,
    market: row.market,
    line: row.line === null ? null : Number(row.line),
    selection: row.selection,
    probability: Number(row.probability),
    confidence: Number(row.confidence_score),
  };
}

/** Selezioni dell'1X2 contenute in una doppia chance. */
const DOUBLE_CHANCE_PARTS: Record<string, readonly string[]> = {
  HOME_DRAW: ["HOME", "DRAW"],
  HOME_AWAY: ["HOME", "AWAY"],
  DRAW_AWAY: ["DRAW", "AWAY"],
};

/**
 * Vero se `b` è implicata da `a` (vince sempre quando vince `a`), quindi è un doppione
 * meno informativo: Over 0,5 rispetto a Over 1,5, 1X rispetto a 1, e così via.
 */
export function implies(a: Pick, b: Pick): boolean {
  if (a.matchId !== b.matchId) return false;
  if (a.market === "1X2" && b.market === "DOUBLE_CHANCE") {
    return DOUBLE_CHANCE_PARTS[b.selection]?.includes(a.selection) ?? false;
  }
  if (a.market !== b.market || a.selection !== b.selection || a.line === b.line) return false;
  if (a.line === null || b.line === null) return false;
  const over = a.selection.endsWith("OVER");
  return over ? a.line > b.line : a.line < b.line;
}

/** Giocate sopra soglia, senza doppioni, ordinate per calcio d'inizio e probabilità. */
export function selectPicks(rows: readonly ActivePredictionRow[], threshold: number): Pick[] {
  const candidates = rows
    .filter((r) => isEligible(r) && Number(r.probability) >= threshold)
    .map(toPick);
  const kept = candidates.filter((b) => !candidates.some((a) => a !== b && implies(a, b)));
  return kept.sort(
    (a, b) =>
      a.kickoffAt.localeCompare(b.kickoffAt) ||
      a.matchId - b.matchId ||
      b.probability - a.probability,
  );
}

export interface MatchPicks {
  matchId: number;
  kickoffAt: string;
  home: string;
  away: string;
  picks: Pick[];
}

export function groupByMatch(picks: readonly Pick[]): MatchPicks[] {
  const groups = new Map<number, MatchPicks>();
  for (const p of picks) {
    const g = groups.get(p.matchId) ?? {
      matchId: p.matchId,
      kickoffAt: p.kickoffAt,
      home: p.home,
      away: p.away,
      picks: [],
    };
    g.picks.push(p);
    groups.set(p.matchId, g);
  }
  return [...groups.values()];
}

/** Esito di una selezione dato il risultato al 90'; `null` se non risolvibile qui. */
export function settle(
  market: PredictionMarket,
  line: number | null,
  selection: string,
  home: number,
  away: number,
): boolean | null {
  const outcome = home > away ? "HOME" : home === away ? "DRAW" : "AWAY";
  switch (market) {
    case "1X2":
      return selection === outcome;
    case "DOUBLE_CHANCE":
      return DOUBLE_CHANCE_PARTS[selection]?.includes(outcome) ?? null;
    case "BTTS":
      return selection === "YES" ? home > 0 && away > 0 : !(home > 0 && away > 0);
    case "TOTAL_GOALS":
      if (line === null) return null;
      return selection === "OVER" ? home + away > line : home + away < line;
    case "TEAM_GOALS": {
      if (line === null) return null;
      const goals = selection.startsWith("HOME") ? home : away;
      return selection.endsWith("OVER") ? goals > line : goals < line;
    }
    default:
      return null;
  }
}

export interface BandStat {
  from: number;
  to: number;
  count: number;
  wins: number;
  /** Probabilità media prevista nella fascia. */
  predicted: number | null;
  /** Frequenza osservata; `null` senza partite. */
  observed: number | null;
}

/** Verifica per fascia sulle partite già giocate (una riga per selezione). */
export function bandStats(
  rows: readonly ActivePredictionRow[],
  results: ReadonlyMap<number, { home: number; away: number }>,
): BandStat[] {
  const stats = BANDS.map(([from, to]) => ({ from, to, count: 0, wins: 0, sum: 0 }));
  for (const r of rows) {
    if (!isEligible(r)) continue;
    const score = results.get(r.match_id);
    if (!score) continue;
    const p = Number(r.probability);
    const band = stats.find((b) => p >= b.from && p < b.to);
    if (!band) continue;
    const won = settle(
      r.market,
      r.line === null ? null : Number(r.line),
      r.selection,
      score.home,
      score.away,
    );
    if (won === null) continue;
    band.count += 1;
    band.sum += p;
    if (won) band.wins += 1;
  }
  return stats.map(({ from, to, count, wins, sum }) => ({
    from,
    to: Math.min(to, 1),
    count,
    wins,
    predicted: count ? sum / count : null,
    observed: count ? wins / count : null,
  }));
}
