import "server-only";
import { cache } from "react";
import type { ActivePredictionRow } from "@predictra/shared-types";
import { consensusFor, marketConsensus } from "@/lib/bet-builder/bollette";
import { bestItalianPrices, type ItalianPrice } from "@/lib/bet-builder/likely";
import { listLatestOdds } from "@/lib/bet-builder/queries";
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
  const out = [];
  for (let i = 0; i < ids.length; i += 200)
    out.push(...(await listLatestOdds(ids.slice(i, i + 200))));
  return out;
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
}

export const loadVerification = cache(async (): Promise<VerificationData> => {
  const verification = await recentVerification();
  const odds = await oddsFor(matchIds(verification.rows));
  return { ...verification, market: marketLookup(marketConsensus(odds)) };
});

/** Soglia, orizzonte e numero di giocate del riquadro in Home. */
export const HOME_CERTAINTY_THRESHOLD = 0.8;
const HOME_CERTAINTY_HOURS = 72;
const HOME_CERTAINTY_MAX = 5;

/** Le giocate più forti delle prossime 72 ore, dalla più probabile (solo quelle partite). */
export async function loadHomeCertainties(now = new Date()): Promise<Pick[]> {
  const rows = await upcomingHighProbability(now, HOME_CERTAINTY_HOURS);
  const odds = await oddsFor(matchIds(rows));
  return selectPicks(rows, HOME_CERTAINTY_THRESHOLD, marketLookup(marketConsensus(odds)))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, HOME_CERTAINTY_MAX);
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
