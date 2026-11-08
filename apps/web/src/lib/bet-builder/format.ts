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

export function formatSlateDate(value: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
