import {
  BET_PROPOSAL_CATEGORIES,
  confidenceBand,
  type BetProposalCategory,
} from "@predictra/shared-types";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";

/** Etichetta di un esito 1X2: "1 · Inter", "X · pareggio", "2 · Milan". */
export function selectionLabel(selection: string, homeTeam: string, awayTeam: string): string {
  const s = getMessages().betBuilder.selections;
  if (selection === "HOME") return fillTemplate(s.HOME, { team: homeTeam });
  if (selection === "AWAY") return fillTemplate(s.AWAY, { team: awayTeam });
  if (selection === "DRAW") return s.DRAW;
  return selection;
}

export function confidenceLabel(score: number): string {
  return getMessages().betBuilder.confidenceBands[confidenceBand(score)];
}

export function parseCategory(raw: unknown): BetProposalCategory | null {
  return typeof raw === "string" && (BET_PROPOSAL_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as BetProposalCategory)
    : null;
}

/** Data `AAAA-MM-GG` valida, altrimenti `null`. */
export function parseSlateDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime()) ? null : raw;
}

/** Puntata massima accettata dal simulatore: oltre non ha senso mostrare un calcolo. */
export const MAX_SIMULATED_STAKE = 100_000;

/** Puntata in euro dall'URL ("4", "4,50", "4.5"), arrotondata al centesimo; altrimenti `null`. */
export function parseStake(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d+([.,]\d{1,2})?$/.test(raw.trim())) return null;
  const value = Math.round(Number(raw.trim().replace(",", ".")) * 100) / 100;
  return value > 0 && value <= MAX_SIMULATED_STAKE ? value : null;
}

export interface StakeOutcome {
  /** Incasso se la schedina è vincente: puntata × quota. */
  payout: number;
  /** Guadagno netto se vincente: incasso − puntata. */
  profit: number;
  /** Probabilità di perdere la puntata secondo il modello. */
  loseProbability: number;
}

/**
 * Cosa succede puntando `stake` su una combinazione: pura aritmetica su quota e
 * probabilità già calcolate dal motore, nessuna stima nuova.
 */
export function stakeOutcome(stake: number, price: number, probability: number): StakeOutcome {
  const payout = Math.round(stake * price * 100) / 100;
  return {
    payout,
    profit: Math.round((payout - stake) * 100) / 100,
    loseProbability: 1 - probability,
  };
}

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function formatEuro(value: number): string {
  return euro.format(value);
}

export function formatSlateDate(value: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
