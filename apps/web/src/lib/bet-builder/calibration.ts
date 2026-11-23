import type { HistoryCheck, Tally } from "@/lib/predictions/history";

/*
 * Correzione storica delle probabilità per le schedine (ADR 0065).
 *
 * Il motore rigioca migliaia di partite passate e conta, per ogni mercato e fascia di
 * probabilità, quante giocate sono uscite davvero (`backtests.reliability.market_bands`).
 * Se un mercato in una fascia è uscito meno di quanto il modello diceva (per esempio
 * l'under 3,5 dato al 78% e uscito al 74%), la probabilità di quella giocata si abbassa
 * di conseguenza; se è uscito di più, si alza, ma poco. Funzioni pure, testate.
 */

/** Fasce della verifica storica (come `BANDS` di `reliability.py`). */
export const HISTORY_BANDS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9] as const;
/** Sotto queste giocate una cella è troppo ballerina e non corregge nulla. */
export const MIN_CELL = 200;
/** Peso a priori (in giocate) verso la probabilità data: tiene prudente la correzione. */
export const PRIOR = 100;
/** Correzione massima: verso il basso fino a 8 punti, verso l'alto fino a 3. */
export const MAX_DOWN = 0.08;
export const MAX_UP = 0.03;

export type Calibration = ReadonlyMap<string, Tally>;

/** "TOTAL_GOALS" + 2.5 → "TOTAL_GOALS:2.5", come le chiavi del motore. */
export function marketKey(market: string, line: number | null): string {
  return line === null ? market : `${market}:${line}`;
}

function bandOf(p: number): number | null {
  let band: number | null = null;
  for (const b of HISTORY_BANDS) if (p >= b) band = b;
  return band;
}

/** Celle mercato × fascia della verifica storica; vuota se il backtest non le ha. */
export function calibrationFrom(history: HistoryCheck | null): Calibration {
  const out = new Map<string, Tally>();
  for (const c of history?.marketBands ?? []) out.set(`${c.market}|${c.from}`, c);
  return out;
}

/**
 * Probabilità corretta con la storia del suo mercato e della sua fascia. Senza una cella
 * abbastanza grande resta quella data.
 */
export function calibrate(
  probability: number,
  market: string,
  line: number | null,
  calibration: Calibration,
): number {
  const band = bandOf(probability);
  if (band === null) return probability;
  const cell = calibration.get(`${marketKey(market, line)}|${band}`);
  if (!cell || cell.count < MIN_CELL || cell.predicted <= 0) return probability;
  const meanPredicted = cell.predicted / cell.count;
  const observed = (cell.wins + PRIOR * meanPredicted) / (cell.count + PRIOR);
  const corrected = probability * (observed / meanPredicted);
  const bounded = Math.min(probability + MAX_UP, Math.max(probability - MAX_DOWN, corrected));
  return Math.min(0.99, Math.max(0.01, bounded));
}
