import "server-only";
import { cache } from "react";
import type { ActivePredictionRow } from "@predictra/shared-types";
import { consensusFor, marketConsensus } from "@/lib/bet-builder/bollette";
import { bestItalianPrices, type ItalianPrice } from "@/lib/bet-builder/likely";
import { listLatestOdds } from "@/lib/bet-builder/queries";
import { inChunks } from "@/lib/chunks";
import { selectPicks, type MarketLookup, type Pick } from "./logic";
import {
  predictionsFor,
  recentVerification,
  upcomingHighProbability,
  type Verification,
} from "./queries";

/*
 * Caricamento condiviso tra la pagina Certezze e il riquadro in Home: previsioni del
 * modello attivo, consenso di mercato senza margine e migliori quote italiane.
 */

const matchIds = (rows: readonly ActivePredictionRow[]) => [
  ...new Set(rows.map((r) => r.match_id)),
];

/** Ultime quote a gruppi di partite, per tenere corto l'indirizzo della richiesta. */
async function oddsFor(ids: readonly number[]) {
  // Circa 200 righe di quote per partita: gruppi da 5 stanno in una pagina, 8 in parallelo.
  return inChunks(ids, 5, (chunk) => listLatestOdds(chunk), 4);
}

export function marketLookup(consensus: ReadonlyMap<string, number>): MarketLookup {
  return (r) =>
    consensusFor(consensus, {
      matchId: r.match_id,
      market: r.market,
      line: r.line === null ? null : Number(r.line),
      selection: r.selection,
    });
}

export interface UpcomingData {
  rows: ActivePredictionRow[];
  market: MarketLookup;
  prices: Map<string, ItalianPrice>;
}

export const loadUpcoming = cache(async (): Promise<UpcomingData> => {
  const rows = await upcomingHighProbability();
  const odds = await oddsFor(matchIds(rows));
  return { rows, market: marketLookup(marketConsensus(odds)), prices: bestItalianPrices(odds) };
});

export interface VerificationData extends Verification {
  market: MarketLookup;
  /** Migliori quote italiane osservate prima del calcio d'inizio. */
  prices: Map<string, ItalianPrice>;
}

export const loadVerification = cache(async (): Promise<VerificationData> => {
  const verification = await recentVerification();
  const kickoff = new Map(verification.rows.map((r) => [r.match_id, Date.parse(r.kickoff_at)]));
  // Solo quote raccolte prima della partita: quelle che si potevano davvero giocare.
  const odds = (await oddsFor(matchIds(verification.rows))).filter(
    (o) => o.match_id !== null && Date.parse(o.observed_at) < (kickoff.get(o.match_id) ?? 0),
  );
  return {
    ...verification,
    market: marketLookup(marketConsensus(odds)),
    prices: bestItalianPrices(odds),
  };
});

/** Soglia, orizzonte e numero di giocate del riquadro in Home. */
export const HOME_CERTAINTY_THRESHOLD = 0.8;
const HOME_CERTAINTY_HOURS = 7 * 24;

/** Tutte le giocate dall'80% delle prossimi 7 giorni, dalla più probabile. */
export async function loadHomeCertainties(now = new Date()): Promise<Pick[]> {
  const rows = await upcomingHighProbability(now, HOME_CERTAINTY_HOURS);
  const odds = await oddsFor(matchIds(rows));
  return selectPicks(rows, HOME_CERTAINTY_THRESHOLD, marketLookup(marketConsensus(odds))).sort(
    (a, b) => b.probability - a.probability,
  );
}

const STRONGEST_THRESHOLD = 0.7;

/** Giocata più forte (dal 70%) di ciascuna partita richiesta, se ce n'è una. */
export async function strongestPicks(ids: readonly number[]): Promise<Map<number, Pick>> {
  const out = new Map<number, Pick>();
  if (ids.length === 0) return out;
  const rows = (await predictionsFor(ids, "certezze delle partite")).filter(
    (r) => r.match_status === "SCHEDULED",
  );
  if (rows.length === 0) return out;
  const odds = await oddsFor(matchIds(rows));
  const picks = selectPicks(rows, STRONGEST_THRESHOLD, marketLookup(marketConsensus(odds)));
  for (const p of picks) {
    const cur = out.get(p.matchId);
    if (!cur || p.probability > cur.probability) out.set(p.matchId, p);
  }
  return out;
}
