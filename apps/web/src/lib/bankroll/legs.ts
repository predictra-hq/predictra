/**
 * Selezioni strutturate di una giocata (colonna `bets.legs`): servono a chiuderla da sola
 * quando le partite finiscono. Funzioni pure, usate dai link "L'ho giocata", dal modulo
 * delle Giocate fatte e dalla chiusura automatica.
 */
import { settle } from "@/lib/certainties/logic";

export interface BetLeg {
  /** match_id */
  m: number;
  /** mercato del modello: 1X2, DOUBLE_CHANCE, TOTAL_GOALS, BTTS */
  k: string;
  /** linea (es. 2.5) o null */
  l: number | null;
  /** esito: HOME, HOME_DRAW, OVER, YES… */
  s: string;
}

/** Mercati che si possono chiudere dal solo risultato finale. */
const SETTLEABLE = new Set(["1X2", "DOUBLE_CHANCE", "TOTAL_GOALS", "BTTS"]);
export const MAX_LEGS = 12;

type PickLike = { matchId: number; market: string; line: number | null; selection: string };

/** `123:1X2::HOME;124:TOTAL_GOALS:2.5:OVER` — per i link e il campo nascosto del modulo. */
export function encodeLegs(picks: readonly PickLike[]): string | null {
  if (picks.length === 0 || picks.length > MAX_LEGS) return null;
  if (!picks.every((p) => SETTLEABLE.has(p.market))) return null;
  return picks.map((p) => `${p.matchId}:${p.market}:${p.line ?? ""}:${p.selection}`).join(";");
}

/** Il contrario di `encodeLegs`; `null` se il testo non è valido (mai fidarsi di un link). */
export function parseLegs(text: string | null | undefined): BetLeg[] | null {
  if (!text) return null;
  const parts = text.split(";");
  if (parts.length === 0 || parts.length > MAX_LEGS) return null;
  const legs: BetLeg[] = [];
  for (const part of parts) {
    const match = /^(\d{1,12}):([A-Z0-9_]{2,20}):(\d{1,2}(?:\.\d{1,2})?)?:([A-Z_]{2,20})$/.exec(
      part,
    );
    if (!match || !SETTLEABLE.has(match[2]!)) return null;
    legs.push({
      m: Number(match[1]),
      k: match[2]!,
      l: match[3] === undefined ? null : Number(match[3]),
      s: match[4]!,
    });
  }
  return new Set(legs.map((l) => l.m)).size === legs.length ? legs : null;
}

export interface MatchOutcome {
  status: string;
  home: number | null;
  away: number | null;
}

/**
 * Esito di una giocata dalle sue selezioni: persa appena una selezione è sbagliata,
 * vinta quando tutte le partite sono finite e tutte le selezioni sono giuste. `null` se
 * manca ancora un risultato o una partita non si è giocata (rinviata, annullata): in quel
 * caso decide l'utente.
 */
export function outcomeOfLegs(
  legs: readonly BetLeg[],
  results: ReadonlyMap<number, MatchOutcome>,
): "WON" | "LOST" | null {
  let pending = false;
  for (const leg of legs) {
    const r = results.get(leg.m);
    if (!r || r.status !== "FINISHED" || r.home === null || r.away === null) {
      pending = true;
      continue;
    }
    const won = settle(leg.k as Parameters<typeof settle>[0], leg.l, leg.s, r.home, r.away);
    if (won === null) pending = true;
    else if (!won) return "LOST";
  }
  return pending ? null : "WON";
}
