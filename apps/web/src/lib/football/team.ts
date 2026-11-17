import type { MatchCenterRow } from "@predictra/shared-types";

/** Esito di una partita dal punto di vista di una squadra: vinta, pareggiata, persa. */
export type TeamOutcome = "V" | "N" | "P";

/** Una partita vista da una squadra: avversario, casa o trasferta, gol fatti e subiti. */
export interface TeamMatchView {
  matchId: number;
  kickoffAt: string;
  competitionName: string;
  isHome: boolean;
  opponentId: number;
  opponentName: string;
  goalsFor: number | null;
  goalsAgainst: number | null;
  outcome: TeamOutcome | null;
}

export function teamMatchView(row: MatchCenterRow, teamId: number): TeamMatchView {
  const isHome = Number(row.home_team_id) === teamId;
  const goalsFor = isHome ? row.home_score : row.away_score;
  const goalsAgainst = isHome ? row.away_score : row.home_score;
  const played = goalsFor !== null && goalsAgainst !== null;
  return {
    matchId: Number(row.match_id),
    kickoffAt: row.kickoff_at,
    competitionName: row.competition_name,
    isHome,
    opponentId: Number(isHome ? row.away_team_id : row.home_team_id),
    opponentName: isHome
      ? (row.away_team_short_name ?? row.away_team_name)
      : (row.home_team_short_name ?? row.home_team_name),
    goalsFor,
    goalsAgainst,
    outcome: !played ? null : goalsFor > goalsAgainst ? "V" : goalsFor === goalsAgainst ? "N" : "P",
  };
}

/** Esiti delle ultime `n` partite giocate, dalla più recente (l'elenco è già in quest'ordine). */
export function recentForm(views: readonly TeamMatchView[], n = 5): TeamOutcome[] {
  return views
    .map((v) => v.outcome)
    .filter((o): o is TeamOutcome => o !== null)
    .slice(0, n);
}

export const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 60;

/** Testo cercato: senza spazi ai bordi, almeno due caratteri; altrimenti nessuna ricerca. */
export function parseSearch(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ").slice(0, SEARCH_MAX_LENGTH);
  return text.length >= SEARCH_MIN_LENGTH ? text : null;
}

/**
 * Modello per `ilike`: "contiene il testo". I caratteri che per Postgres sono jolly (`%`,
 * `_`) o di escape (`\`) vengono cercati come testo, e le virgole e le parentesi, che
 * nei filtri di PostgREST separano le condizioni, sono tolte.
 */
export function containsPattern(text: string): string {
  const clean = text.replace(/[,()]/g, " ").replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${clean}%`;
}
