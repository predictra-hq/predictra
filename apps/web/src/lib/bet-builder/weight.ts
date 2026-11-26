import { DEFAULT_BET_BUILDER_RULES } from "@predictra/shared-types";

/*
 * Peso del mercato nella probabilità usata (ADR 0028, 0071, 0073), letto in un solo punto dalle
 * regole condivise con il motore Python. Prima tre letture avevano ripieghi diversi (0,75 e 0):
 * se il campo fosse sparito, schedine, Costruisci e Kelly avrebbero usato pesi diversi senza
 * dirlo. Ora manca il campo, si ferma tutto con un errore esplicito.
 */
const weight = DEFAULT_BET_BUILDER_RULES.market_weight;
if (typeof weight !== "number" || !(weight >= 0 && weight <= 1)) {
  throw new Error("market_weight mancante o fuori da 0–1 in DEFAULT_BET_BUILDER_RULES");
}

export const MARKET_WEIGHT: number = weight;
