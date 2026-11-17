/**
 * Stake suggerito (ADR 0031) e limiti personali (ADR 0030 §2).
 * Il suggerimento è solo informativo: PREDICTRA non piazza scommesse.
 */
import { STAKING } from "@predictra/shared-types";
import { floorCents } from "./money";

export interface Limits {
  max_stake: number | null;
  max_open_bets: number | null;
  max_daily_loss: number | null;
  max_weekly_loss: number | null;
}

export type LimitViolation = "MAX_STAKE" | "MAX_OPEN_BETS" | "MAX_DAILY_LOSS" | "MAX_WEEKLY_LOSS";

/** Stake flat: disponibile × percentuale (tra 0,1% e 5%), arrotondato per difetto. */
export function flatStake(available: number, pct: number = STAKING.flatDefault): number {
  if (!(pct >= STAKING.flatMin && pct <= STAKING.flatMax)) {
    throw new RangeError(`Percentuale flat fuori intervallo: ${pct}`);
  }
  return available > 0 ? floorCents(available * pct) : 0;
}

/** Frazione di Kelly f* = (p·o − 1)/(o − 1). Negativa o nulla: valore atteso non positivo. */
export function kellyFraction(probability: number, odds: number): number {
  if (!(probability >= 0 && probability <= 1)) throw new RangeError("Probabilità non valida");
  if (!(odds > 1)) throw new RangeError("Quota non valida");
  return (probability * odds - 1) / (odds - 1);
}

/** Kelly frazionario limitato: disponibile × min(0,25·f*, 2%); 0 se f* ≤ 0. */
export function kellyStake(
  available: number,
  probability: number,
  odds: number,
  fraction: number = STAKING.kellyFraction,
  cap: number = STAKING.kellyCap,
): number {
  const f = kellyFraction(probability, odds);
  if (f <= 0 || available <= 0) return 0;
  return floorCents(available * Math.min(fraction * f, cap));
}

/** Puntata minima abituale dei bookmaker italiani: sotto non ha senso suggerire. */
export const MIN_PLAYABLE_STAKE = 2;

/**
 * Puntata giocabile: euro interi per difetto, almeno `MIN_PLAYABLE_STAKE` se il calcolo
 * dà qualcosa di positivo; 0 se non si può giocare (calcolo nullo, disponibile o
 * limite personale sotto il minimo).
 */
export function playableStake(stake: number, available: number, maxStake: number | null): number {
  if (!(stake > 0)) return 0;
  const ceiling = Math.min(available, maxStake ?? Infinity);
  if (ceiling < MIN_PLAYABLE_STAKE) return 0;
  return Math.min(Math.max(Math.floor(stake), MIN_PLAYABLE_STAKE), Math.floor(ceiling));
}

export interface StakeSuggestion {
  flat: number;
  /** null se manca la probabilità del modello o la quota. */
  kelly: number | null;
  /** Motivo per cui Kelly non è disponibile o è zero. */
  kellyNote: "NO_PROBABILITY" | "NON_POSITIVE_EV" | null;
  /** Vero se un suggerimento è stato ridotto per rispettare `max_stake`. */
  cappedByLimit: boolean;
}

export function suggestStake(input: {
  available: number;
  flatPct?: number;
  probability?: number | null;
  odds?: number | null;
  limits?: Limits | null;
}): StakeSuggestion {
  const maxStake = input.limits?.max_stake ?? null;
  let capped = false;
  const cap = (stake: number) => {
    if (maxStake !== null && stake > maxStake) {
      capped = true;
      return floorCents(maxStake);
    }
    return stake;
  };

  // Suggerimenti giocabili: euro interi, minimo 2 € (mai 0,97 € su una schedina).
  const playable = (stake: number) => playableStake(cap(stake), input.available, maxStake);
  const flat = playable(flatStake(input.available, input.flatPct));
  if (input.probability === null || input.probability === undefined || !input.odds) {
    return { flat, kelly: null, kellyNote: "NO_PROBABILITY", cappedByLimit: capped };
  }
  const raw = kellyStake(input.available, input.probability, input.odds);
  return {
    flat,
    kelly: playable(raw),
    kellyNote: raw === 0 ? "NON_POSITIVE_EV" : null,
    cappedByLimit: capped,
  };
}

/**
 * Stessi controlli del trigger `check_personal_limits` (ADR 0030 §2), per avvisare
 * prima di salvare. Il database resta l'unica garanzia.
 */
export function checkLimits(input: {
  stake: number;
  limits: Limits | null;
  openBets: number;
  lossLast24h: number;
  lossLast7d: number;
}): LimitViolation[] {
  const l = input.limits;
  if (!l) return [];
  const out: LimitViolation[] = [];
  if (l.max_stake !== null && input.stake > l.max_stake) out.push("MAX_STAKE");
  if (l.max_open_bets !== null && input.openBets >= l.max_open_bets) out.push("MAX_OPEN_BETS");
  if (l.max_daily_loss !== null && input.lossLast24h >= l.max_daily_loss)
    out.push("MAX_DAILY_LOSS");
  if (l.max_weekly_loss !== null && input.lossLast7d >= l.max_weekly_loss) {
    out.push("MAX_WEEKLY_LOSS");
  }
  return out;
}

/** Perdita netta delle giocate chiuse dopo `since` (positiva se in perdita, come nel trigger). */
export function lossSince(
  bets: readonly {
    status: string;
    stake: number;
    payout: number | null;
    settled_at: string | null;
  }[],
  since: Date,
): number {
  let cents = 0;
  for (const b of bets) {
    if (b.status === "OPEN" || !b.settled_at || new Date(b.settled_at) < since) continue;
    cents += Math.round(Number(b.stake) * 100) - Math.round(Number(b.payout ?? 0) * 100);
  }
  return cents / 100;
}
