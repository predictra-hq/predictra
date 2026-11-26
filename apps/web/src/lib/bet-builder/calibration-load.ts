import "server-only";
import { cache } from "react";
import { getActiveHistoryCheck } from "@/lib/predictions/queries";
import { calibrationFrom, type Calibration } from "./calibration";
import { orFallback } from "@/lib/log";

/**
 * Celle della verifica storica del modello attivo per le schedine (ADR 0065), una lettura
 * per richiesta. Senza verifica (o se la lettura fallisce) nessuna correzione.
 */
export const loadCalibration = cache(async (): Promise<Calibration> => {
  const history = await getActiveHistoryCheck().catch(
    orFallback("bet-builder/calibration-load #1", null),
  );
  return calibrationFrom(history);
});
