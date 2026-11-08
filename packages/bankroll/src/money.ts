/** Importi in euro: i calcoli si fanno in centesimi interi per evitare errori di arrotondamento. */

export const toCents = (euros: number): number => Math.round(Number(euros) * 100);
export const toEuros = (cents: number): number => cents / 100;

/** Arrotonda per difetto al centesimo: uno stake suggerito non supera mai il calcolo. */
export const floorCents = (euros: number): number => Math.floor(Number(euros) * 100 + 1e-9) / 100;
