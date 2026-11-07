import type {
  FreshnessStatus,
  IngestionRunStatus,
  IssueSeverity,
  MatchStatus,
  QualityStatus,
  SourceHealthState,
} from "@predictra/shared-types";

export type Tone = "neutral" | "positive" | "negative" | "warning";

/** Ordine di presentazione delle competizioni della v1 (ADR 0010 §3). */
export const COMPETITION_ORDER = ["SA", "PL", "PD", "BL1", "FL1", "DED", "PPL", "CL"] as const;

export function sortCompetitions<T extends { code: string | null; name: string }>(rows: T[]): T[] {
  const rank = (code: string | null) => {
    const i = COMPETITION_ORDER.indexOf((code ?? "") as (typeof COMPETITION_ORDER)[number]);
    return i === -1 ? COMPETITION_ORDER.length : i;
  };
  return [...rows].sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name));
}

export function matchStatusTone(status: MatchStatus): Tone {
  switch (status) {
    case "LIVE":
      return "positive";
    case "FINISHED":
    case "AWARDED":
      return "neutral";
    case "SCHEDULED":
      return "neutral";
    default:
      return "warning";
  }
}

export function qualityTone(quality: QualityStatus): Tone {
  return quality === "OK" ? "positive" : quality === "WARNING" ? "warning" : "negative";
}

export function freshnessTone(freshness: FreshnessStatus | null): Tone {
  if (freshness === null) return "neutral";
  return freshness === "FRESH" ? "positive" : "warning";
}

export function healthTone(health: SourceHealthState): Tone {
  return health === "OK" ? "positive" : health === "DEGRADED" ? "negative" : "neutral";
}

export function runStatusTone(status: IngestionRunStatus): Tone {
  switch (status) {
    case "SUCCEEDED":
      return "positive";
    case "PARTIAL":
      return "warning";
    case "FAILED":
      return "negative";
    default:
      return "neutral";
  }
}

export function severityTone(severity: IssueSeverity): Tone {
  return severity === "ERROR" ? "negative" : severity === "WARNING" ? "warning" : "neutral";
}

/** "2 – 1" se il punteggio esiste, altrimenti "–". */
export function formatScore(home: number | null, away: number | null): string {
  return home === null || away === null ? "–" : `${home} – ${away}`;
}

/**
 * Legge il parametro "giornata" dall'URL: un intero positivo, "all" per tutte,
 * altrimenti `null` (si usa la giornata corrente).
 */
export function parseMatchday(value: string | string[] | undefined): number | "all" | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "all") return "all";
  if (!raw || !/^[1-9][0-9]{0,2}$/.test(raw)) return null;
  return Number(raw);
}

/** Codice competizione dall'URL: solo lettere maiuscole e cifre (2–10). */
export function parseCompetitionCode(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[A-Z0-9]{2,10}$/.test(raw) ? raw : null;
}

/** ID numerico positivo (es. segmento di URL), altrimenti `null`. */
export function parseId(value: string): number | null {
  return /^[1-9][0-9]{0,15}$/.test(value) ? Number(value) : null;
}
