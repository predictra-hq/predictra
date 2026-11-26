/*
 * Statistiche per l'analisi delle schedine (ADR 0073, 0075). Funzioni pure e deterministiche
 * (generatore con seme fisso): due giri sugli stessi dati danno gli stessi numeri.
 *
 * Le schedine non sono indipendenti: due schedine che condividono una partita vincono o
 * perdono insieme. L'intervallo del ritorno si calcola quindi ricampionando gruppi di
 * schedine collegate da partite comuni, non le schedine una per una.
 */

/** Generatore pseudo-casuale con seme (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gruppi di elementi collegati da almeno una chiave comune (componenti connesse).
 * Restituisce, per ogni elemento, l'indice del suo gruppo.
 */
export function linkedGroups(keys: readonly (readonly string[])[]): number[] {
  const parent = keys.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const owner = new Map<string, number>();
  keys.forEach((list, i) => {
    for (const k of list) {
      const j = owner.get(k);
      if (j === undefined) owner.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const ids = new Map<number, number>();
  return keys.map((_, i) => {
    const root = find(i);
    if (!ids.has(root)) ids.set(root, ids.size);
    return ids.get(root)!;
  });
}

export interface BootstrapResult {
  n: number;
  /** Gruppi indipendenti: è questo, non `n`, che dice quanto pesa il campione. */
  groups: number;
  mean: number;
  low: number;
  high: number;
}

/**
 * Media dei valori con intervallo al 95% da bootstrap a gruppi (percentili 2,5 e 97,5).
 * `keys` di ogni valore: le partite della schedina.
 */
export function clusteredBootstrap(
  items: readonly { keys: readonly string[]; value: number }[],
  { reps = 2000, seed = 20261126 }: { reps?: number; seed?: number } = {},
): BootstrapResult | null {
  const n = items.length;
  if (n === 0) return null;
  const group = linkedGroups(items.map((x) => x.keys));
  const totals: { sum: number; count: number }[] = [];
  items.forEach((x, i) => {
    const g = (totals[group[i]!] ??= { sum: 0, count: 0 });
    g.sum += x.value;
    g.count += 1;
  });
  const mean = items.reduce((a, x) => a + x.value, 0) / n;
  const random = seededRandom(seed);
  const means: number[] = [];
  for (let r = 0; r < reps; r++) {
    let sum = 0;
    let count = 0;
    for (let k = 0; k < totals.length; k++) {
      const g = totals[Math.floor(random() * totals.length)]!;
      sum += g.sum;
      count += g.count;
    }
    means.push(sum / count);
  }
  means.sort((a, b) => a - b);
  const at = (q: number) => means[Math.min(reps - 1, Math.max(0, Math.round(q * (reps - 1))))]!;
  return { n, groups: totals.length, mean, low: at(0.025), high: at(0.975) };
}

export interface CalibrationResult {
  n: number;
  /** Uscite attese secondo le probabilità date. */
  expected: number;
  observed: number;
  /** (uscite − attese) ÷ deviazione standard: oltre ±2 la taratura è sospetta. */
  z: number;
}

/** Le probabilità date sono tarate? Somma delle differenze tra uscite e probabilità. */
export function calibrationTest(
  legs: readonly { probability: number; won: boolean }[],
): CalibrationResult | null {
  if (legs.length === 0) return null;
  let expected = 0;
  let observed = 0;
  let variance = 0;
  for (const l of legs) {
    expected += l.probability;
    observed += l.won ? 1 : 0;
    variance += l.probability * (1 - l.probability);
  }
  const z = variance > 0 ? (observed - expected) / Math.sqrt(variance) : 0;
  return { n: legs.length, expected, observed, z };
}

export interface PairedBrierResult {
  n: number;
  /** Brier di A − Brier di B: negativo = A indovina meglio. */
  difference: number;
  /** Errore standard della differenza, giocata per giocata. */
  standardError: number;
}

/** Confronto appaiato di due probabilità sulle stesse giocate (per esempio modello e mercato). */
export function pairedBrier(
  legs: readonly { a: number; b: number; won: boolean }[],
): PairedBrierResult | null {
  const n = legs.length;
  if (n < 2) return null;
  const d = legs.map((l) => {
    const y = l.won ? 1 : 0;
    return (l.a - y) ** 2 - (l.b - y) ** 2;
  });
  const mean = d.reduce((a, x) => a + x, 0) / n;
  const variance = d.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1);
  return { n, difference: mean, standardError: Math.sqrt(variance / n) };
}

/** Quantile (0–1) di una lista, per descrivere una distribuzione senza sceglierne il massimo. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}
