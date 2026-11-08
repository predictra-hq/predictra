/*
 * Catalogo dei mercati mostrato in Market Intelligence (B4, ADR 0005).
 *
 * Un mercato risulta "quote disponibili" solo se è nella tabella `markets` del
 * database E ci sono davvero eventi con quote raccolte. Tutto il resto è
 * dichiarato per quello che è: senza quote in v1 oppure non valutabile.
 */

export type MarketKey =
  | "h2h"
  | "doubleChance"
  | "drawNoBet"
  | "overUnder"
  | "bothTeamsToScore"
  | "teamGoals"
  | "correctScore"
  | "handicap"
  | "corners"
  | "cards"
  | "shots"
  | "scorers"
  | "playerMarkets"
  | "halves";

/**
 * - `collected`: mercato raccolto da The Odds API (in v1 solo `h2h`, ADR 0015).
 * - `modelOnly`: valutabile dal modello gol (M4), ma nessuna quota raccolta in v1.
 * - `unevaluable`: non valutabile in v1, nessuna fonte gratuita adeguata (ADR 0005).
 */
export type MarketTier = "collected" | "modelOnly" | "unevaluable";

export interface MarketDefinition {
  key: MarketKey;
  tier: MarketTier;
  /** Codice nella tabella `markets` (solo per i mercati raccolti). */
  dbCode?: string;
}

export const MARKET_CATALOG: readonly MarketDefinition[] = [
  { key: "h2h", tier: "collected", dbCode: "h2h" },
  { key: "doubleChance", tier: "modelOnly" },
  { key: "drawNoBet", tier: "modelOnly" },
  { key: "overUnder", tier: "modelOnly" },
  { key: "bothTeamsToScore", tier: "modelOnly" },
  { key: "teamGoals", tier: "modelOnly" },
  { key: "correctScore", tier: "modelOnly" },
  { key: "handicap", tier: "modelOnly" },
  { key: "corners", tier: "unevaluable" },
  { key: "cards", tier: "unevaluable" },
  { key: "shots", tier: "unevaluable" },
  { key: "scorers", tier: "unevaluable" },
  { key: "playerMarkets", tier: "unevaluable" },
  { key: "halves", tier: "unevaluable" },
];

/**
 * Stato effettivo mostrato all'utente:
 * - `available`: quote reali raccolte e presenti nel database;
 * - `noOddsYet`: mercato raccolto ma ancora nessun evento con quote;
 * - `noOdds`: valutabile dal modello gol, ma senza quote in v1;
 * - `unevaluable`: non valutabile in v1.
 */
export type MarketAvailability = "available" | "noOddsYet" | "noOdds" | "unevaluable";

export function marketAvailability(
  market: MarketDefinition,
  collectedCodes: ReadonlySet<string>,
  eventsWithOdds: number,
): MarketAvailability {
  if (market.tier === "unevaluable") return "unevaluable";
  if (market.tier === "modelOnly") return "noOdds";
  if (!market.dbCode || !collectedCodes.has(market.dbCode)) return "noOdds";
  return eventsWithOdds > 0 ? "available" : "noOddsYet";
}
