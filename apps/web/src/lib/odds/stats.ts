import type { LeagueSeasonStatsRow, TeamSeasonStatsRow } from "@predictra/shared-types";

/*
 * Logica pura di Statistics Center e League Intelligence (M3 corsia B).
 * I numeri di partenza vengono dalle viste SQL (solo partite concluse di
 * `v_match_results`); qui si calcolano solo medie e differenze per la lettura.
 */

/** Media per partita; `null` se non ci sono partite. */
export function perMatch(total: number, played: number): number | null {
  return played > 0 ? total / played : null;
}

/** Frazione sulle partite giocate (0–1); `null` se non ci sono partite. */
export function rate(count: number, played: number): number | null {
  return played > 0 ? count / played : null;
}

/**
 * Ordine della classifica calcolata dai risultati: punti, differenza reti, gol
 * fatti, poi nome. Non applica i criteri ufficiali (scontri diretti,
 * penalizzazioni): per quelli fa fede la classifica della fonte.
 */
export function sortTeamStats(rows: readonly TeamSeasonStatsRow[]): TeamSeasonStatsRow[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goals_for - b.goals_against - (a.goals_for - a.goals_against) ||
      b.goals_for - a.goals_for ||
      a.team_name.localeCompare(b.team_name, "it"),
  );
}

export type FormResult = "V" | "N" | "P";

/** "VVNPV" → ["V","V","N","P","V"], ignorando caratteri inattesi. */
export function parseForm(form: string | null | undefined): FormResult[] {
  if (!form) return [];
  return [...form].filter((c): c is FormResult => c === "V" || c === "N" || c === "P");
}

/** Punti delle ultime partite della forma (V = 3, N = 1, P = 0). */
export function formPoints(form: readonly FormResult[]): number {
  return form.reduce((acc, r) => acc + (r === "V" ? 3 : r === "N" ? 1 : 0), 0);
}

export interface HomeAdvantage {
  /** Gol in più segnati in media dalla squadra di casa rispetto all'ospite. */
  goals: number;
  /** Differenza tra percentuale di vittorie in casa e in trasferta (punti percentuali / 100). */
  winRate: number;
  /** Punti medi per partita della squadra di casa e dell'ospite. */
  homePoints: number;
  awayPoints: number;
}

/** Vantaggio casalingo di una stagione di lega; `null` senza partite. */
export function homeAdvantage(
  row: Pick<
    LeagueSeasonStatsRow,
    | "matches"
    | "avg_home_goals"
    | "avg_away_goals"
    | "home_win_rate"
    | "draw_rate"
    | "away_win_rate"
  >,
): HomeAdvantage | null {
  if (!(row.matches > 0)) return null;
  const home = Number(row.home_win_rate);
  const draw = Number(row.draw_rate);
  const away = Number(row.away_win_rate);
  return {
    goals: Number(row.avg_home_goals) - Number(row.avg_away_goals),
    winRate: home - away,
    homePoints: 3 * home + draw,
    awayPoints: 3 * away + draw,
  };
}
