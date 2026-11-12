import {
  BET_PROPOSAL_CATEGORIES,
  confidenceBand,
  type BetProposalCategory,
} from "@predictra/shared-types";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";

/** Etichetta di un esito 1X2: "1 · Inter", "X · pareggio", "2 · Milan". */
/**
 * Etichetta di una selezione. Senza mercato o con 1X2: "1 · Squadra". Per gli altri
 * mercati (ADR 0033): "Doppia chance 1X", "Totale gol Over 2,5".
 */
export function selectionLabel(
  selection: string,
  homeTeam: string,
  awayTeam: string,
  market?: string | null,
  line?: number | string | null,
): string {
  if (market && market !== "1X2") {
    const p = getMessages().predictions;
    const name = p.markets[market as keyof typeof p.markets] ?? market;
    const sel = (p.selections as Record<string, string>)[selection] ?? selection;
    const value = line === null || line === undefined ? "" : String(Number(line)).replace(".", ",");
    return [name, sel, value].filter(Boolean).join(" ");
  }
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

/** Inizio del turno (ADR 0036): venerdì per venerdì–lunedì, martedì per martedì–giovedì. */
export function roundStartOf(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  const weekday = d.getUTCDay(); // domenica = 0
  const back = weekday >= 5 ? weekday - 5 : weekday === 0 ? 2 : weekday === 1 ? 3 : weekday - 2;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** "venerdì 20 – lunedì 23 novembre" oppure "martedì 24 – giovedì 26 novembre". */
export function formatRound(start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() + (d.getUTCDay() === 5 ? 3 : 2));
  const fmt = (x: Date, month: boolean) =>
    new Intl.DateTimeFormat("it-IT", {
      weekday: "long",
      day: "numeric",
      ...(month ? { month: "long" } : {}),
      timeZone: "UTC",
    }).format(x);
  return `${fmt(d, d.getUTCMonth() !== end.getUTCMonth())} – ${fmt(end, true)}`;
}

export function formatSlateDate(value: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
