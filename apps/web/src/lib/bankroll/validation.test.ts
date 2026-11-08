import { describe, expect, it } from "vitest";
import {
  bankrollSchema,
  betSchema,
  limitsSchema,
  movementSchema,
  parseDecimal,
  parseEuro,
  settleSchema,
  toIsoDate,
} from "./validation";

describe("importi", () => {
  it("virgola, punto, segno meno tipografico, vuoto", () => {
    expect(parseEuro("12,50")).toBe(12.5);
    expect(parseEuro("1 000")).toBe(1000);
    expect(parseEuro("−5")).toBe(-5);
    expect(parseEuro("")).toBeUndefined();
    expect(parseEuro("1,234")).toBeNaN();
    expect(parseEuro("abc")).toBeNaN();
    expect(parseDecimal("2,05")).toBe(2.05);
  });
});

describe("moduli", () => {
  it("bankroll: percentuale flat da % a frazione, predefinita 1%", () => {
    expect(bankrollSchema.parse({ name: " Reale ", kind: "REAL", flatPct: "0,5" })).toEqual({
      name: "Reale",
      kind: "REAL",
      flatPct: 0.005,
    });
    expect(bankrollSchema.parse({ name: "X", kind: "SIMULATED", flatPct: "" }).flatPct).toBe(0.01);
    expect(bankrollSchema.safeParse({ name: "X", kind: "REAL", flatPct: "6" }).success).toBe(false);
  });

  it("movimenti: positivi per depositi e prelievi, con segno per le rettifiche", () => {
    const base = { bankrollId: "1", occurredAt: "", note: "" };
    expect(movementSchema.safeParse({ ...base, kind: "DEPOSIT", amount: "100" }).success).toBe(
      true,
    );
    expect(movementSchema.safeParse({ ...base, kind: "DEPOSIT", amount: "-5" }).success).toBe(
      false,
    );
    expect(movementSchema.safeParse({ ...base, kind: "ADJUSTMENT", amount: "-5" }).success).toBe(
      true,
    );
    expect(movementSchema.safeParse({ ...base, kind: "ADJUSTMENT", amount: "0" }).success).toBe(
      false,
    );
  });

  it("limiti: campi vuoti = nessun limite", () => {
    expect(
      limitsSchema.parse({
        bankrollId: "3",
        maxStake: "20",
        maxOpenBets: "",
        maxDailyLoss: "",
        maxWeeklyLoss: "100,5",
      }),
    ).toEqual({
      bankrollId: 3,
      maxStake: 20,
      maxOpenBets: undefined,
      maxDailyLoss: undefined,
      maxWeeklyLoss: 100.5,
    });
  });

  it("giocata: quota > 1 e stake positivo", () => {
    const ok = {
      bankrollId: "1",
      description: "DEMO Casa – Ospite",
      market: "1X2",
      selection: "1",
      line: "",
      odds: "2,10",
      stake: "10",
      bookmaker: "",
      placedAt: "",
      closingOdds: "",
    };
    expect(betSchema.parse(ok)).toMatchObject({
      odds: 2.1,
      stake: 10,
      line: undefined,
      bookmaker: undefined,
    });
    expect(betSchema.safeParse({ ...ok, odds: "1" }).success).toBe(false);
    expect(betSchema.safeParse({ ...ok, stake: "0" }).success).toBe(false);
  });

  it("chiusura: il cash out richiede l'incasso", () => {
    expect(settleSchema.safeParse({ betId: "1", status: "CASHED_OUT", payout: "" }).success).toBe(
      false,
    );
    expect(settleSchema.safeParse({ betId: "1", status: "CASHED_OUT", payout: "14" }).success).toBe(
      true,
    );
    expect(settleSchema.safeParse({ betId: "1", status: "WON", payout: "" }).success).toBe(true);
  });

  it("date", () => {
    expect(toIsoDate("2026-11-08T18:30:00Z")).toBe("2026-11-08T18:30:00.000Z");
    expect(toIsoDate("non-una-data")).toBeUndefined();
    expect(toIsoDate(undefined)).toBeUndefined();
  });
});

describe("periodi del Tracker", async () => {
  const { parsePeriod, timeWindows } = await import("./period");
  it("periodo valido o predefinito a 90 giorni", () => {
    expect(parsePeriod("30")).toBe("30");
    expect(parsePeriod("x")).toBe("90");
    const now = new Date("2026-11-08T12:00:00Z");
    expect(timeWindows("30", now).since?.toISOString()).toBe("2026-10-09T12:00:00.000Z");
    expect(timeWindows("all", now).since).toBeNull();
    expect(timeWindows("all", now).weekAgo.toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });
});
