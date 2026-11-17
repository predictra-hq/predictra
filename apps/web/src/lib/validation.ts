import { z } from "zod";
import { ROLES } from "@predictra/shared-types";
import { getMessages } from "@/lib/i18n";

const m = getMessages();

/** Normalizza (trim + minuscolo) PRIMA di validare. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

// Stessi requisiti di Supabase Auth (config.toml: 12 caratteri, lettere e numeri),
// controllati prima per rispondere con un messaggio breve in italiano.
export const passwordSchema = z
  .string()
  .min(12, m.auth.passwordTooShort)
  .max(128)
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), m.auth.passwordLetterDigit);

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: m.auth.passwordMismatch, path: ["confirm"] });

export const totpCodeSchema = z.string().regex(/^\d{6}$/, m.auth.mfaInvalid);

export const roleSchema = z.enum(ROLES);

export const uuidSchema = z.uuid();

/** Solo percorsi interni: blocca open redirect verso domini esterni. */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
