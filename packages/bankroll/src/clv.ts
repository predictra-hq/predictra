/**
 * CLV (Closing Line Value) approssimato (M0 §4, ADR 0015).
 *
 * Non esiste uno storico gratuito delle quote di chiusura: la "chiusura" è l'ultima
 * quota dei propri snapshot (M3) osservata prima del calcio d'inizio. Per questo il
 * valore è sempre dichiarato come approssimato.
 *
 * CLV = quota presa / quota di chiusura − 1. Positivo: si è presa una quota migliore
 * di quella finale.
 */

export interface OddsObservation {
  price: number;
  /** Istante dell'osservazione (observed_at o event_time dello snapshot). */
  at: string;
}

export function clv(oddsTaken: number, closingOdds: number): number {
  if (!(oddsTaken > 1) || !(closingOdds > 1)) throw new RangeError("Quote non valide");
  return oddsTaken / closingOdds - 1;
}

/** Ultima quota osservata non oltre il calcio d'inizio; null se non ce ne sono. */
export function approximateClosingOdds(
  observations: readonly OddsObservation[],
  kickoff: string,
): number | null {
  const limit = new Date(kickoff).getTime();
  let best: OddsObservation | null = null;
  for (const o of observations) {
    const t = new Date(o.at).getTime();
    if (t > limit || !(o.price > 1)) continue;
    if (!best || t > new Date(best.at).getTime()) best = o;
  }
  return best ? Number(best.price) : null;
}

/** CLV medio delle giocate che hanno una quota di chiusura; null se nessuna. */
export function averageClv(
  bets: readonly { odds: number; closing_odds: number | null }[],
): number | null {
  const values = bets
    .filter((b) => b.closing_odds !== null && Number(b.closing_odds) > 1)
    .map((b) => clv(Number(b.odds), Number(b.closing_odds)));
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
