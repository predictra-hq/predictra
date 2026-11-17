/** Una quota raccolta: bookmaker, esito, prezzo e momento in cui il bookmaker l'ha aggiornata. */
export interface OddsPoint {
  bookmaker: string;
  selection: string;
  price: number;
  /** Istante ISO dell'aggiornamento secondo la fonte (`event_time`). */
  at: string;
}

export interface SelectionMovement {
  selection: string;
  /** Media delle prime quote raccolte di ogni bookmaker. */
  open: number;
  /** Media delle ultime quote raccolte degli stessi bookmaker. */
  last: number;
  /** Variazione relativa tra apertura e ultima: negativa se la quota è scesa. */
  change: number;
  bookmakers: number;
  /** Media nel tempo delle quote in vigore, dal primo all'ultimo aggiornamento. */
  series: { at: string; price: number }[];
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Movimento delle quote per esito. Per ogni bookmaker si tengono la prima e l'ultima quota
 * raccolta; apertura e ultima sono le medie tra i bookmaker. La serie è la media, a ogni
 * aggiornamento, delle quote in vigore in quel momento. È aritmetica su quote reali già
 * raccolte: nessuna stima.
 */
export function oddsMovement(
  points: readonly OddsPoint[],
  selections: readonly string[],
): SelectionMovement[] {
  const out: SelectionMovement[] = [];
  for (const selection of selections) {
    const rows = points
      .filter((p) => p.selection === selection && Number.isFinite(p.price) && p.price > 1)
      .sort((a, b) => a.at.localeCompare(b.at));
    if (rows.length === 0) continue;

    const first = new Map<string, number>();
    const current = new Map<string, number>();
    const series: SelectionMovement["series"] = [];
    for (const row of rows) {
      if (!first.has(row.bookmaker)) first.set(row.bookmaker, row.price);
      current.set(row.bookmaker, row.price);
      const price = mean([...current.values()]);
      const lastPoint = series.at(-1);
      // Più bookmaker aggiornati nello stesso istante: un solo punto, con la media finale.
      if (lastPoint && lastPoint.at === row.at) lastPoint.price = price;
      else series.push({ at: row.at, price });
    }
    const open = mean([...first.values()]);
    const last = mean([...current.values()]);
    out.push({
      selection,
      open,
      last,
      change: last / open - 1,
      bookmakers: first.size,
      series,
    });
  }
  return out;
}

/** Sotto questa variazione la quota si considera ferma. */
export const MOVEMENT_THRESHOLD = 0.01;

export type MovementDirection = "down" | "up" | "flat";

export function movementDirection(change: number): MovementDirection {
  if (change <= -MOVEMENT_THRESHOLD) return "down";
  if (change >= MOVEMENT_THRESHOLD) return "up";
  return "flat";
}

/**
 * Punti di una linea in un riquadro `width` × `height` (coordinate SVG): tempo in
 * orizzontale, quota in verticale con la più alta in cima. Con un solo punto non c'è linea.
 */
export function sparklinePoints(
  series: readonly { at: string; price: number }[],
  width: number,
  height: number,
): string | null {
  if (series.length < 2) return null;
  const times = series.map((s) => Date.parse(s.at));
  const t0 = times[0]!;
  const span = times.at(-1)! - t0 || 1;
  const prices = series.map((s) => s.price);
  const min = Math.min(...prices);
  const range = Math.max(...prices) - min || 1;
  return series
    .map((s, i) => {
      const x = ((times[i]! - t0) / span) * width;
      const y = height - ((s.price - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
