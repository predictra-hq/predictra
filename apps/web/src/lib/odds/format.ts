import type { FreshnessStatus, MatchOddsH2hRow } from "@predictra/shared-types";
import { InvalidOddsError, overround, powerProbabilities } from "@predictra/quant";

/*
 * Logica pura di Market Intelligence (M3 corsia B): formattazione, freschezza,
 * margine e probabilità implicite. Nessun accesso al database qui: le letture
 * sono in `queries.ts`. Le probabilità sono "implicite nelle quote", non
 * previsioni di PREDICTRA (ADR 0016, regola 5 di CLAUDE.md).
 */

const LOCALE = "it-IT";

/** Sostituisce i segnaposto `{nome}` di un testo di `it.ts`; quelli senza valore restano. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/** Quota decimale con due cifre: 2 → "2,00". */
export function formatOdds(price: number | null | undefined): string {
  if (price === null || price === undefined || !Number.isFinite(price)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/** Frazione come percentuale: 0.0441 → "4,4%". */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Numero con cifre decimali fisse: 1.4567 → "1,46". */
export function formatDecimal(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Differenza con segno esplicito: 0.31 → "+0,31", -2 → "−2,00". */
export function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value);
}

/**
 * Converte un `interval` di Postgres come lo restituisce PostgREST (stile
 * `postgres`: "12:00:00", "1 day", "30 days", "1 day 06:00:00") in millisecondi.
 * `null` se il formato non è riconosciuto o l'intervallo manca.
 */
export function parsePgInterval(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(?:(\d+)\s+days?)?\s*(?:(\d{1,3}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*$/.exec(
    value,
  );
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

/**
 * Stessa regola delle viste (`v_match_odds_h2h`): FRESH se l'osservazione è più
 * recente della soglia, STALE altrimenti; `null` se non c'è nessuna osservazione.
 * Senza soglia configurata il dato è FRESH, come nel database.
 */
export function freshnessAt(
  observedAt: string | null | undefined,
  maxAgeMs: number | null,
  now: Date = new Date(),
): FreshnessStatus | null {
  if (!observedAt) return null;
  const observed = new Date(observedAt).getTime();
  if (Number.isNaN(observed)) return null;
  if (maxAgeMs === null) return "FRESH";
  return observed >= now.getTime() - maxAgeMs ? "FRESH" : "STALE";
}

export interface Triplet {
  home: number;
  draw: number;
  away: number;
}

export interface H2hAnalysis {
  /** Prezzi 1, X, 2. */
  odds: Triplet;
  /** Margine (overround) ricalcolato con `@predictra/quant`. */
  overround: number;
  /** Probabilità senza margine, metodo proporzionale (dal database, ADR 0016). */
  proportional: Triplet;
  /** Probabilità senza margine, metodo della potenza (`@predictra/quant`); null se non calcolabile. */
  power: Triplet | null;
}

/**
 * Margine e probabilità implicite di una riga 1X2. Il metodo proporzionale è
 * quello predefinito e arriva già calcolato dalla vista; il metodo della potenza
 * si calcola qui come confronto (ADR 0016). `null` se le quote non sono valide.
 */
export function analyseH2h(
  row: Pick<
    MatchOddsH2hRow,
    | "home_price"
    | "draw_price"
    | "away_price"
    | "home_probability"
    | "draw_probability"
    | "away_probability"
  >,
): H2hAnalysis | null {
  const odds = [Number(row.home_price), Number(row.draw_price), Number(row.away_price)];
  let margin: number;
  try {
    margin = overround(odds);
  } catch (error) {
    if (error instanceof InvalidOddsError) return null;
    throw error;
  }
  let power: Triplet | null = null;
  try {
    const [home, draw, away] = powerProbabilities(odds);
    power = { home: home!, draw: draw!, away: away! };
  } catch (error) {
    if (!(error instanceof InvalidOddsError)) throw error;
  }
  return {
    odds: { home: odds[0]!, draw: odds[1]!, away: odds[2]! },
    overround: margin,
    proportional: {
      home: Number(row.home_probability),
      draw: Number(row.draw_probability),
      away: Number(row.away_probability),
    },
    power,
  };
}

/** Tono del margine: sotto il 5% buono, sopra il 10% alto. Solo indicativo. */
export function marginTone(value: number): "positive" | "neutral" | "warning" {
  if (value < 0.05) return "positive";
  if (value > 0.1) return "warning";
  return "neutral";
}

export interface OddsEventGroup {
  eventId: number;
  matchId: number | null;
  competitionId: number | null;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  /** Versioni italiane secondo il provider (chiave `*_it`), in ordine di nome. */
  italian: MatchOddsH2hRow[];
  /** Tutti gli altri bookmaker: solo riferimento statistico. */
  reference: MatchOddsH2hRow[];
  /** Ultima osservazione fra tutti i bookmaker dell'evento. */
  lastObservedAt: string;
  /** FRESH se almeno un bookmaker ha quote fresche. */
  freshness: FreshnessStatus;
  freshBookmakers: number;
}

/**
 * Raggruppa le righe di `v_match_odds_h2h` per evento, separando le versioni
 * italiane dai bookmaker di solo riferimento. Eventi in ordine di calcio d'inizio.
 */
export function groupOddsByEvent(rows: readonly MatchOddsH2hRow[]): OddsEventGroup[] {
  const groups = new Map<number, OddsEventGroup>();
  for (const row of rows) {
    let group = groups.get(row.event_id);
    if (!group) {
      group = {
        eventId: row.event_id,
        matchId: row.match_id,
        competitionId: row.competition_id,
        commenceTime: row.commence_time,
        homeTeam: row.home_team_name,
        awayTeam: row.away_team_name,
        italian: [],
        reference: [],
        lastObservedAt: row.observed_at,
        freshness: "STALE",
        freshBookmakers: 0,
      };
      groups.set(row.event_id, group);
    }
    (row.italian_market ? group.italian : group.reference).push(row);
    if (Date.parse(row.observed_at) > Date.parse(group.lastObservedAt)) {
      group.lastObservedAt = row.observed_at;
    }
    if (row.freshness === "FRESH") {
      group.freshness = "FRESH";
      group.freshBookmakers += 1;
    }
  }
  const byTitle = (a: MatchOddsH2hRow, b: MatchOddsH2hRow) =>
    a.bookmaker_title.localeCompare(b.bookmaker_title, "it");
  return [...groups.values()]
    .map((g) => ({ ...g, italian: g.italian.sort(byTitle), reference: g.reference.sort(byTitle) }))
    .sort(
      (a, b) => Date.parse(a.commenceTime) - Date.parse(b.commenceTime) || a.eventId - b.eventId,
    );
}
