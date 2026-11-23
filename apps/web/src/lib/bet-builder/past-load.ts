import "server-only";
import { loadVerification } from "@/lib/certainties/load";
import { buildBollette } from "./bollette";
import { loadCalibration } from "./calibration-load";
import type { LikelyRow } from "./likely";
import { pastRounds, type PastRound } from "./past";
import { loadPicksData } from "./queries";

/**
 * Schedine dei turni già iniziati (ADR 0062): per le partite finite l'ultima previsione e
 * le quote prima del calcio d'inizio, per quelle ancora da giocare del turno in corso le
 * previsioni e le quote di adesso. Stesse regole della pagina Proposte.
 */
export async function loadPastRounds(): Promise<PastRound[]> {
  const [verification, live, calibration] = await Promise.all([
    loadVerification(),
    loadPicksData(),
    loadCalibration(),
  ]);
  const rows = [...(verification.rows as unknown as LikelyRow[]), ...live.rows];
  const prices = new Map([...live.prices, ...verification.prices]);
  const consensus = new Map([...live.consensus, ...verification.consensus]);
  return pastRounds(buildBollette(rows, prices, consensus, calibration), verification.results);
}
