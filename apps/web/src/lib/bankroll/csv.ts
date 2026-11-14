import type { BetRow } from "@predictra/shared-types";

/*
 * Esportazione CSV delle giocate (Tracker). Logica pura: la lettura, con la sessione
 * dell'utente e la RLS, è in `queries.ts`.
 *
 * Formato pensato per i fogli di calcolo in italiano: separatore `;`, decimali con la
 * virgola, date in ISO 8601 (UTC). I testi liberi che iniziano con `=`, `+`, `-`, `@`
 * vengono neutralizzati con un apostrofo, così un foglio di calcolo non li esegue come
 * formule.
 */

export const CSV_SEPARATOR = ";";

export interface BetCsvLabels {
  columns: {
    placedAt: string;
    bankroll: string;
    kind: string;
    event: string;
    market: string;
    selection: string;
    line: string;
    odds: string;
    stake: string;
    bookmaker: string;
    status: string;
    payout: string;
    profit: string;
    closingOdds: string;
    modelProbability: string;
    settledAt: string;
    note: string;
  };
  kinds: Record<BetRow["bankroll_kind"], string>;
  statuses: Record<BetRow["status"], string>;
}

/** Testo libero: niente formule, e virgolette quando serve. */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Numero con la virgola decimale; vuoto se assente o non valido. */
export function csvNumber(value: number | string | null | undefined, digits = 2): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(digits).replace(".", ",");
}

/** Istante in ISO 8601 UTC senza millisecondi: "2026-11-14T18:45:00Z". */
export function csvInstant(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function betsToCsv(bets: readonly BetRow[], labels: BetCsvLabels): string {
  const c = labels.columns;
  const header = [
    c.placedAt,
    c.bankroll,
    c.kind,
    c.event,
    c.market,
    c.selection,
    c.line,
    c.odds,
    c.stake,
    c.bookmaker,
    c.status,
    c.payout,
    c.profit,
    c.closingOdds,
    c.modelProbability,
    c.settledAt,
    c.note,
  ].map(csvText);
  const rows = bets.map((b) => [
    csvInstant(b.placed_at),
    csvText(b.bankroll_name),
    csvText(labels.kinds[b.bankroll_kind] ?? b.bankroll_kind),
    csvText(b.description),
    csvText(b.market),
    csvText(b.selection),
    csvNumber(b.line),
    csvNumber(b.odds),
    csvNumber(b.stake),
    csvText(b.bookmaker),
    csvText(labels.statuses[b.status] ?? b.status),
    csvNumber(b.payout),
    csvNumber(b.profit),
    csvNumber(b.closing_odds),
    csvNumber(b.model_probability, 4),
    csvInstant(b.settled_at),
    csvText(b.note),
  ]);
  return [header, ...rows].map((r) => r.join(CSV_SEPARATOR)).join("\r\n") + "\r\n";
}
