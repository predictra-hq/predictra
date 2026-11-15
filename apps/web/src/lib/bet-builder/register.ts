import { suggestStake, type Limits, type StakeSuggestion } from "@predictra/bankroll";
import type { Bolletta } from "./bollette";

/*
 * Dalla schedina consigliata alla giocata registrata: link al modulo "Aggiungi giocata"
 * del Tracker già compilato e puntata consigliata sul bankroll dell'utente.
 * Solo informativo: PREDICTRA non piazza scommesse e non registra nulla da sola.
 */

/** Bankroll su cui calcolare la puntata consigliata. */
export interface AdviceBankroll {
  name: string;
  available: number;
  flatPct: number;
  limits: Limits | null;
}

/** Il bankroll di riferimento: il primo reale, altrimenti il primo che c'è. */
export function pickAdviceBankroll<T extends { kind: string }>(bankrolls: readonly T[]): T | null {
  return bankrolls.find((b) => b.kind === "REAL") ?? bankrolls[0] ?? null;
}

/** Puntata Kelly (un quarto, tetto 2%, stake massimo dei limiti) per la schedina, ADR 0031. */
export function bollettaAdvice(bolletta: Bolletta, bankroll: AdviceBankroll): StakeSuggestion {
  return suggestStake({
    available: bankroll.available,
    flatPct: bankroll.flatPct,
    probability: bolletta.probability,
    odds: bolletta.price,
    limits: bankroll.limits,
  });
}

const MAX_DESCRIPTION = 200;

/**
 * Link `/tracker?add=1&…` per registrare la schedina come una sola giocata multipla:
 * partite nella descrizione, quota totale reale, bookmaker solo se è lo stesso per tutte
 * le selezioni, puntata se indicata. Gli stessi parametri del link "Registra" delle Certezze.
 */
export function bollettaTrackerHref(
  bolletta: Bolletta,
  labels: { market: string; selection: string },
  stake: number | null,
): string {
  const matches = bolletta.picks.map((p) => `${p.home} – ${p.away}`).join("; ");
  const params = new URLSearchParams({
    add: "1",
    d: matches.length > MAX_DESCRIPTION ? `${matches.slice(0, MAX_DESCRIPTION - 1)}…` : matches,
    mk: labels.market,
    sel: labels.selection,
    o: bolletta.price.toFixed(2),
  });
  const bookmakers = new Set(bolletta.picks.map((p) => p.bookmaker));
  if (bookmakers.size === 1) params.set("bk", [...bookmakers][0]!);
  if (stake !== null && stake > 0) params.set("st", stake.toFixed(2));
  return `/tracker?${params.toString()}#bet-event`;
}
