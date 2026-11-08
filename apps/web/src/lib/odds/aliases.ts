/*
 * Logica pura della pagina admin degli alias (M3 corsia B).
 *
 * The Odds API chiama le squadre in modo diverso da football-data.org. Un evento
 * di quote si abbina a una partita solo se entrambi i nomi ricevuti si ritrovano
 * in `team_aliases` (ADR 0015 §3). Qui si ricostruisce, dai problemi di qualità
 * `odds.event_unmatched`, quali nomi mancano: gli alias si aggiungono solo
 * guardando i nomi reali ricevuti, mai inventati.
 */

/** Stessa normalizzazione di `app_private.normalize_team_name` e `team_aliases.normalized_alias`. */
export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface AliasRow {
  team_id: number;
  normalized_alias: string;
}

/** Indice alias normalizzato → squadre (più di una = alias ambiguo). */
export function buildAliasIndex(rows: readonly AliasRow[]): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  for (const row of rows) {
    const set = index.get(row.normalized_alias) ?? new Set<number>();
    set.add(Number(row.team_id));
    index.set(row.normalized_alias, set);
  }
  return index;
}

export type AliasResolution =
  | { status: "known"; teamId: number }
  | { status: "ambiguous"; teamIds: number[] }
  | { status: "missing" };

/** Come `app_private.team_by_alias`: una sola squadra, altrimenti ambiguo o mancante. */
export function resolveAlias(name: string, index: Map<string, Set<number>>): AliasResolution {
  const teams = index.get(normalizeTeamName(name));
  if (!teams || teams.size === 0) return { status: "missing" };
  if (teams.size === 1) return { status: "known", teamId: [...teams][0]! };
  return { status: "ambiguous", teamIds: [...teams].sort((a, b) => a - b) };
}

export interface UnmatchedIssue {
  id: number;
  provider_entity_id: string | null;
  details: unknown;
  last_seen_at: string;
}

export interface UnmatchedEvent {
  issueId: number;
  providerEventId: string | null;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string | null;
  competitionCode: string | null;
  lastSeenAt: string;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Estrae i nomi ricevuti dal campo `details`; scarta i problemi senza nomi. */
export function parseUnmatchedIssue(issue: UnmatchedIssue): UnmatchedEvent | null {
  const details =
    issue.details && typeof issue.details === "object"
      ? (issue.details as Record<string, unknown>)
      : {};
  const homeTeam = text(details.home_team);
  const awayTeam = text(details.away_team);
  if (!homeTeam || !awayTeam) return null;
  return {
    issueId: issue.id,
    providerEventId: issue.provider_entity_id,
    homeTeam,
    awayTeam,
    commenceTime: text(details.commence_time),
    competitionCode: text(details.competition_code),
    lastSeenAt: issue.last_seen_at,
  };
}

export interface NameToMap {
  /** Nome esattamente come ricevuto da The Odds API (prima occorrenza). */
  name: string;
  normalized: string;
  competitionCodes: string[];
  /** Eventi non abbinati in cui compare il nome. */
  events: number;
  resolution: AliasResolution;
}

/**
 * Nomi da abbinare, uno per nome normalizzato, con il numero di eventi in cui
 * compaiono. Prima i nomi mancanti o ambigui (più eventi prima), poi quelli già
 * noti (l'evento si abbinerà alla prossima raccolta).
 */
export function namesToMap(
  events: readonly UnmatchedEvent[],
  index: Map<string, Set<number>>,
): NameToMap[] {
  const byName = new Map<string, NameToMap>();
  for (const event of events) {
    for (const name of [event.homeTeam, event.awayTeam]) {
      const normalized = normalizeTeamName(name);
      let entry = byName.get(normalized);
      if (!entry) {
        entry = {
          name: name.trim(),
          normalized,
          competitionCodes: [],
          events: 0,
          resolution: resolveAlias(name, index),
        };
        byName.set(normalized, entry);
      }
      entry.events += 1;
      if (event.competitionCode && !entry.competitionCodes.includes(event.competitionCode)) {
        entry.competitionCodes.push(event.competitionCode);
      }
    }
  }
  const rank = (r: AliasResolution) => (r.status === "known" ? 1 : 0);
  return [...byName.values()].sort(
    (a, b) =>
      rank(a.resolution) - rank(b.resolution) ||
      b.events - a.events ||
      a.name.localeCompare(b.name, "it"),
  );
}

/** Parole che non distinguono una squadra dall'altra. */
const STOP_WORDS = new Set([
  "ac",
  "as",
  "afc",
  "bc",
  "bv",
  "calcio",
  "cf",
  "club",
  "de",
  "fc",
  "fk",
  "rc",
  "sc",
  "sl",
  "ss",
  "ssc",
  "sv",
  "ud",
  "us",
  "vfb",
  "vfl",
  "1.",
]);

function tokens(name: string): string[] {
  return normalizeTeamName(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Possibile corrispondenza per un nome ricevuto, solo come aiuto alla scelta:
 * la squadra candidata con più parole in comune (almeno una). Nessun
 * suggerimento se c'è un pari merito. L'alias lo conferma sempre una persona.
 */
export function suggestTeam<T extends { id: number; name: string; short_name?: string | null }>(
  name: string,
  candidates: readonly T[],
): T | null {
  const wanted = new Set(tokens(name));
  if (wanted.size === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const candidate of candidates) {
    const own = new Set([
      ...tokens(candidate.name),
      ...(candidate.short_name ? tokens(candidate.short_name) : []),
    ]);
    let score = 0;
    for (const t of wanted) if (own.has(t)) score += 1;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0 && candidate.id !== best?.id) {
      tie = true;
    }
  }
  return bestScore > 0 && !tie ? best : null;
}
