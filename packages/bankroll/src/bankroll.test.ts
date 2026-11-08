/*
 * Casi calcolati a mano. Importi e giocate DEMO.
 */
import { describe, expect, it } from "vitest";
import {
  approximateClosingOdds,
  averageClv,
  betProfit,
  checkLimits,
  clv,
  computeMetrics,
  flatStake,
  kellyFraction,
  kellyStake,
  lossSince,
  metricsByKind,
  netDeposits,
  profitCurve,
  suggestStake,
  type BetLike,
} from "./index";

const bet = (
  status: BetLike["status"],
  stake: number,
  odds: number,
  payout: number | null,
  day: number,
): BetLike => ({
  status,
  stake,
  odds,
  payout,
  settled_at: status === "OPEN" ? null : `2026-11-${String(day).padStart(2, "0")}T20:00:00Z`,
});

/*
 * Sequenza DEMO (in ordine di chiusura):
 *   1/11 WON   10 @ 2,00 → +10     cumulato +10 (picco 10)
 *   2/11 LOST  20 @ 3,00 → −20     cumulato −10 (discesa 20 dal picco 10)
 *   3/11 VOID  15 @ 1,80 →   0     cumulato −10
 *   4/11 WON   10 @ 2,50 → +15     cumulato  +5
 *   aperta     12 @ 1,90
 * Stake chiusi 55; profitto +5; yield 5/55 = 9,09%; decise 3, in profitto 2 → 66,7%;
 * drawdown massimo 20 €; capitale netto 200 − 50 = 150 → ROI 5/150 = 3,33%;
 * drawdown % = 20 / (150 + 10) = 12,5%. Quota media chiuse (2 + 3 + 1,8 + 2,5)/4 = 2,325.
 */
const SEQUENCE: BetLike[] = [
  bet("WON", 10, 2, 20, 1),
  bet("LOST", 20, 3, 0, 2),
  bet("VOID", 15, 1.8, 15, 3),
  bet("WON", 10, 2.5, 25, 4),
  bet("OPEN", 12, 1.9, null, 5),
];
const MOVEMENTS = [
  { kind: "DEPOSIT" as const, amount: 200 },
  { kind: "WITHDRAWAL" as const, amount: 50 },
  { kind: "ADJUSTMENT" as const, amount: -3 },
];

describe("metriche", () => {
  it("sequenza calcolata a mano", () => {
    const m = computeMetrics(SEQUENCE, MOVEMENTS);
    expect(m).toMatchObject({
      bets: 5,
      openBets: 1,
      settledBets: 4,
      openStakes: 12,
      staked: 55,
      profit: 5,
      maxDrawdown: 20,
    });
    expect(m.yield).toBeCloseTo(5 / 55, 10);
    expect(m.roi).toBeCloseTo(5 / 150, 10);
    expect(m.hitRate).toBeCloseTo(2 / 3, 10);
    expect(m.maxDrawdownPct).toBeCloseTo(20 / 160, 10);
    expect(m.averageOdds).toBeCloseTo(2.325, 10);
  });

  it("nessuna giocata: metriche vuote, non zero inventati", () => {
    const m = computeMetrics([]);
    expect(m).toMatchObject({
      bets: 0,
      profit: 0,
      yield: null,
      roi: null,
      hitRate: null,
      averageOdds: null,
    });
  });

  it("depositi netti e profitto della singola giocata", () => {
    expect(netDeposits(MOVEMENTS)).toBe(150); // le rettifiche non sono capitale versato
    expect(betProfit(bet("HALF_WON", 10, 2, 15, 1))).toBe(5);
    expect(betProfit(bet("OPEN", 10, 2, null, 1))).toBeNull();
  });

  it("niente errori di arrotondamento in centesimi", () => {
    const m = computeMetrics([bet("WON", 0.1, 2, 0.2, 1), bet("WON", 0.2, 2, 0.4, 2)]);
    expect(m.profit).toBe(0.3);
    expect(m.staked).toBe(0.3);
  });

  it("reali e simulate separate", () => {
    const tagged = [
      { ...bet("WON", 10, 2, 20, 1), bankroll_kind: "REAL" as const },
      { ...bet("WON", 100, 2, 200, 1), bankroll_kind: "SIMULATED" as const },
    ];
    const byKind = metricsByKind(tagged);
    expect(byKind.REAL.profit).toBe(10);
    expect(byKind.SIMULATED.profit).toBe(100);
  });

  it("curva del profitto cumulato", () => {
    expect(profitCurve(SEQUENCE).map((p) => p.profit)).toEqual([10, -10, -10, 5]);
  });
});

describe("stake suggerito (ADR 0031)", () => {
  it("flat: 1% di 1.234,56 € = 12,34 € (per difetto)", () => {
    expect(flatStake(1234.56)).toBe(12.34);
    expect(flatStake(0)).toBe(0);
    expect(() => flatStake(100, 0.2)).toThrow(RangeError);
  });

  it("esempio dell'ADR: p 0,55, quota 2,00, 1.000 € → 20 €", () => {
    expect(kellyFraction(0.55, 2)).toBeCloseTo(0.1, 12);
    expect(kellyStake(1000, 0.55, 2)).toBe(20);
  });

  it("Kelly sotto il tetto: p 0,52, quota 2,00 → f* 0,04, un quarto 1% → 10 €", () => {
    expect(kellyStake(1000, 0.52, 2)).toBe(10);
  });

  it("valore atteso non positivo → 0", () => {
    expect(kellyStake(1000, 0.45, 2)).toBe(0);
    expect(suggestStake({ available: 1000, probability: 0.45, odds: 2 })).toMatchObject({
      kelly: 0,
      kellyNote: "NON_POSITIVE_EV",
    });
  });

  it("senza probabilità solo flat; il limite personale riduce i suggerimenti", () => {
    expect(suggestStake({ available: 1000 })).toEqual({
      flat: 10,
      kelly: null,
      kellyNote: "NO_PROBABILITY",
      cappedByLimit: false,
    });
    const limited = suggestStake({
      available: 1000,
      probability: 0.55,
      odds: 2,
      limits: { max_stake: 15, max_open_bets: null, max_daily_loss: null, max_weekly_loss: null },
    });
    expect(limited).toEqual({ flat: 10, kelly: 15, kellyNote: null, cappedByLimit: true });
  });
});

describe("limiti personali (come il trigger del database)", () => {
  const limits = { max_stake: 20, max_open_bets: 2, max_daily_loss: 30, max_weekly_loss: 100 };

  it("segnala ogni limite superato", () => {
    expect(
      checkLimits({ stake: 25, limits, openBets: 2, lossLast24h: 30, lossLast7d: 100 }),
    ).toEqual(["MAX_STAKE", "MAX_OPEN_BETS", "MAX_DAILY_LOSS", "MAX_WEEKLY_LOSS"]);
    expect(
      checkLimits({ stake: 20, limits, openBets: 1, lossLast24h: 29.99, lossLast7d: 0 }),
    ).toEqual([]);
    expect(
      checkLimits({ stake: 999, limits: null, openBets: 9, lossLast24h: 999, lossLast7d: 999 }),
    ).toEqual([]);
  });

  it("perdita dal momento indicato", () => {
    const since = new Date("2026-11-02T00:00:00Z");
    // Dal 2/11: LOST −20, VOID 0, WON +15 → perdita netta 5.
    expect(lossSince(SEQUENCE, since)).toBe(5);
  });
});

describe("CLV approssimato", () => {
  it("quota presa 2,10 contro chiusura 2,00 → +5%", () => {
    expect(clv(2.1, 2)).toBeCloseTo(0.05, 12);
  });

  it("chiusura = ultima osservazione non oltre il calcio d'inizio", () => {
    const obs = [
      { price: 2.2, at: "2026-11-08T09:00:00Z" },
      { price: 2.05, at: "2026-11-08T19:00:00Z" },
      { price: 1.9, at: "2026-11-08T21:00:00Z" }, // dopo il calcio d'inizio: ignorata
    ];
    expect(approximateClosingOdds(obs, "2026-11-08T19:45:00Z")).toBe(2.05);
    expect(approximateClosingOdds([], "2026-11-08T19:45:00Z")).toBeNull();
  });

  it("CLV medio solo sulle giocate con chiusura", () => {
    expect(
      averageClv([
        { odds: 2.1, closing_odds: 2 },
        { odds: 1.9, closing_odds: 2 },
        { odds: 3, closing_odds: null },
      ]),
    ).toBeCloseTo((0.05 - 0.05) / 2, 12);
  });
});
