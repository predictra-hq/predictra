import type { PredictionMarket } from "@predictra/shared-types";
import { settle } from "@/lib/certainties/logic";
import type { Bolletta, BollettaPick } from "./bollette";

/*
 * Schedine consigliate dei turni passati e come sono andate (ADR 0062). Le schedine non
 * sono salvate: si ricostruiscono con le stesse regole della pagina Proposte, usando per
 * ogni partita l'ultima previsione e le quote raccolte prima del calcio d'inizio.
 * Funzioni pure, testate in past.test.ts.
 */

export type PastOutcome = "WON" | "LOST" | "PENDING";

export interface PastLeg {
  pick: BollettaPick;
  /** `null` finché la partita non è finita. */
  won: boolean | null;
  /** Risultato finale, es. "2-1". */
  score: string | null;
}

export interface PastBolletta {
  bolletta: Bolletta;
  legs: PastLeg[];
  outcome: PastOutcome;
}

export interface PastRound {
  round: string;
  bollette: PastBolletta[];
  won: number;
  settled: number;
}

export function settleBolletta(
  bolletta: Bolletta,
  results: ReadonlyMap<number, { home: number; away: number }>,
): PastBolletta {
  const legs = bolletta.picks.map((pick) => {
    const r = results.get(pick.matchId);
    return {
      pick,
      won: r
        ? settle(pick.market as PredictionMarket, pick.line, pick.selection, r.home, r.away)
        : null,
      score: r ? `${r.home}-${r.away}` : null,
    };
  });
  const outcome: PastOutcome = legs.some((l) => l.won === false)
    ? "LOST"
    : legs.every((l) => l.won === true)
      ? "WON"
      : "PENDING";
  return { bolletta, legs, outcome };
}

/**
 * Turni già iniziati (almeno una partita giocata), dal più recente, con le schedine e il
 * loro esito. I turni futuri restano nella pagina Proposte.
 */
export function pastRounds(
  bollette: readonly Bolletta[],
  results: ReadonlyMap<number, { home: number; away: number }>,
  limit = 4,
): PastRound[] {
  const byRound = new Map<string, PastBolletta[]>();
  for (const b of bollette) {
    if (!b.picks.some((p) => results.has(p.matchId))) continue;
    byRound.set(b.round, [...(byRound.get(b.round) ?? []), settleBolletta(b, results)]);
  }
  return [...byRound.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, limit)
    .map(([round, list]) => ({
      round,
      bollette: list,
      won: list.filter((x) => x.outcome === "WON").length,
      settled: list.filter((x) => x.outcome !== "PENDING").length,
    }));
}
