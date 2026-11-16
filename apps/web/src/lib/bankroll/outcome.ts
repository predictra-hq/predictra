/** Esito di una giocata per colori e strisce: aperta, vinta, persa o in pari (rimborso). */
export type BetOutcome = "open" | "won" | "lost" | "even";

export function betOutcome(status: string, profit: number | string | null | undefined): BetOutcome {
  if (status === "OPEN") return "open";
  const value = Number(profit ?? 0);
  if (value > 0) return "won";
  if (value < 0) return "lost";
  return "even";
}
