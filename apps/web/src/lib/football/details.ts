/*
 * Statistiche e formazioni di una partita (ADR 0012): funzioni pure per la pagina di
 * dettaglio. I dati arrivano da API-Football; qui solo ordinamento e impaginazione.
 */

/** Ordine di lettura delle voci più comuni; le altre seguono in ordine alfabetico. */
export const STAT_ORDER = [
  "ball_possession",
  "expected_goals",
  "total_shots",
  "shots_on_goal",
  "shots_off_goal",
  "blocked_shots",
  "shots_insidebox",
  "shots_outsidebox",
  "corner_kicks",
  "offsides",
  "fouls",
  "yellow_cards",
  "red_cards",
  "goalkeeper_saves",
  "total_passes",
  "passes_accurate",
  "passes_pct",
  "goals_prevented",
] as const;

/** Voci espresse in percentuale (0–100). */
export const PERCENT_STATS = new Set(["ball_possession", "passes_pct"]);

export interface StatRow {
  stat: string;
  home: number | null;
  away: number | null;
}

/** Una riga per voce, con il valore della squadra di casa e di quella in trasferta. */
export function statRows(
  statistics: readonly { team_id: number; stat: string; value: number | null }[],
  homeTeamId: number,
  awayTeamId: number,
): StatRow[] {
  const rows = new Map<string, StatRow>();
  for (const s of statistics) {
    if (s.team_id !== homeTeamId && s.team_id !== awayTeamId) continue;
    const row = rows.get(s.stat) ?? { stat: s.stat, home: null, away: null };
    const value = s.value === null ? null : Number(s.value);
    if (s.team_id === homeTeamId) row.home = value;
    else row.away = value;
    rows.set(s.stat, row);
  }
  const rank = (stat: string) => {
    const i = (STAT_ORDER as readonly string[]).indexOf(stat);
    return i === -1 ? STAT_ORDER.length : i;
  };
  return [...rows.values()]
    .filter((r) => r.home !== null || r.away !== null)
    .sort((a, b) => rank(a.stat) - rank(b.stat) || a.stat.localeCompare(b.stat));
}

/** "4:2" → [4, 2]; griglia mancante in fondo. */
function gridKey(grid: string | null): [number, number] {
  const m = grid ? /^(\d{1,2}):(\d{1,2})$/.exec(grid) : null;
  return m ? [Number(m[1]), Number(m[2])] : [99, 99];
}

/** Titolari per linea (dal portiere in avanti), poi la panchina per numero di maglia. */
export function sortPlayers<
  T extends { is_starter: boolean; grid: string | null; shirt_number: number | null },
>(players: readonly T[]): { starters: T[]; bench: T[] } {
  const starters = players
    .filter((p) => p.is_starter)
    .sort((a, b) => {
      const [ra, ca] = gridKey(a.grid);
      const [rb, cb] = gridKey(b.grid);
      return ra - rb || ca - cb;
    });
  const bench = players
    .filter((p) => !p.is_starter)
    .sort((a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999));
  return { starters, bench };
}

/** Etichetta di una voce senza traduzione: "shots_insidebox" → "Shots insidebox". */
export function humanize(code: string): string {
  const text = code.replace(/_/g, " ").trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Valore leggibile: interi senza decimali, decimali con la virgola, percentuali con %. */
export function formatStat(stat: string, value: number | null): string {
  if (value === null) return "–";
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0$/, "").replace(".", ",");
  return PERCENT_STATS.has(stat) ? `${text}%` : text;
}
