import { z } from "zod";
import { BANKROLL_KINDS, BET_STATUSES, MOVEMENT_KINDS } from "@predictra/shared-types";

/** "12,50" | "12.50" | "−5" → numero; stringa vuota → undefined. Massimo due decimali. */
export function parseEuro(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim().replace(/\s/g, "").replace("−", "-").replace(",", ".");
  if (raw === "") return undefined;
  if (!/^-?\d{1,9}(\.\d{1,2})?$/.test(raw)) return Number.NaN;
  return Number(raw);
}

/** Quota o linea: fino a tre decimali, virgola accettata. */
export function parseDecimal(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim().replace("−", "-").replace(",", ".");
  if (raw === "") return undefined;
  if (!/^-?\d{1,5}(\.\d{1,3})?$/.test(raw)) return Number.NaN;
  return Number(raw);
}

const euro = z.preprocess(parseEuro, z.number().finite());
const optionalPositiveEuro = z.preprocess(parseEuro, z.number().finite().positive().optional());
const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

export const bankrollSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(BANKROLL_KINDS),
  // Percentuale inserita come "1" o "0,5" → frazione 0,01 o 0,005.
  flatPct: z
    .preprocess(parseDecimal, z.number().min(0.1).max(5).optional())
    .transform((v) => (v === undefined ? 0.01 : Math.round(v * 100) / 10000)),
});

export const movementSchema = z
  .object({
    bankrollId: id,
    kind: z.enum(MOVEMENT_KINDS),
    amount: euro,
    occurredAt: optionalText(30),
    note: optionalText(500),
  })
  .refine((v) => (v.kind === "ADJUSTMENT" ? v.amount !== 0 : v.amount > 0), {
    path: ["amount"],
  });

export const limitsSchema = z.object({
  bankrollId: id,
  maxStake: optionalPositiveEuro,
  maxOpenBets: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().positive().max(1000).optional(),
  ),
  maxDailyLoss: optionalPositiveEuro,
  maxWeeklyLoss: optionalPositiveEuro,
});

export const betSchema = z.object({
  bankrollId: id,
  description: z.string().trim().min(1).max(200),
  market: z.string().trim().min(1).max(40),
  selection: z.string().trim().min(1).max(40),
  line: z.preprocess(parseDecimal, z.number().finite().min(-20).max(20).optional()),
  odds: z.preprocess(parseDecimal, z.number().gt(1).max(10000)),
  stake: z.preprocess(parseEuro, z.number().positive()),
  bookmaker: optionalText(60),
  placedAt: optionalText(30),
  closingOdds: z.preprocess(parseDecimal, z.number().gt(1).max(10000).optional()),
});

export const settleSchema = z
  .object({
    betId: id,
    status: z.enum(BET_STATUSES),
    payout: z.preprocess(parseEuro, z.number().min(0).optional()),
    closingOdds: z.preprocess(parseDecimal, z.number().gt(1).max(10000).optional()),
  })
  .refine((v) => v.status !== "CASHED_OUT" || v.payout !== undefined, { path: ["payout"] });

/** "2026-11-08" o "2026-11-08T18:30" → ISO; non valida → undefined. */
export function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
