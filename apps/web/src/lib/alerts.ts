/**
 * Avvisi in Home ("Da non perdere"): le giocate sopra la soglia scelta dall'utente che si
 * giocano a breve e le schedine con valore del prossimo turno. La soglia è una preferenza
 * di questo browser (cookie), come il tema. Nessuna email, nessuna notifica push: la
 * piattaforma non ne invia.
 */

export const ALERT_COOKIE = "predictra-alert";
/** Soglie di probabilità selezionabili (in percentuale). */
export const ALERT_THRESHOLDS = [80, 85, 90] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];
export const DEFAULT_ALERT_THRESHOLD: AlertThreshold = 85;
/** "A breve": calcio d'inizio entro 36 ore. */
export const ALERT_HOURS = 36;

export function parseAlertThreshold(raw: unknown): AlertThreshold {
  const n = Number(raw);
  return (ALERT_THRESHOLDS as readonly number[]).includes(n)
    ? (n as AlertThreshold)
    : DEFAULT_ALERT_THRESHOLD;
}

/** Giocate sopra soglia che iniziano entro `hours`, una per partita, dalla più vicina. */
export function soonPicks<T extends { matchId: number; kickoffAt: string; probability: number }>(
  picks: readonly T[],
  now: Date,
  threshold: AlertThreshold,
  hours = ALERT_HOURS,
): T[] {
  const end = now.getTime() + hours * 3_600_000;
  const best = new Map<number, T>();
  for (const pick of picks) {
    const at = new Date(pick.kickoffAt).getTime();
    if (pick.probability < threshold / 100 || at < now.getTime() || at > end) continue;
    const seen = best.get(pick.matchId);
    if (!seen || pick.probability > seen.probability) best.set(pick.matchId, pick);
  }
  return [...best.values()].sort(
    (a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || b.probability - a.probability,
  );
}
