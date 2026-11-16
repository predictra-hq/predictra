import { safeNextPath } from "@/lib/validation";

/** Tipi di link accettati da /auth/confirm. La registrazione pubblica non esiste. */
export const CONFIRM_TYPES = ["invite", "recovery", "email_change", "email"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

/** Destinazione predefinita per tipo di link. */
const DEFAULT_NEXT: Partial<Record<ConfirmType, string>> = {
  invite: "/accept-invite",
  recovery: "/reset-password",
};

export interface ConfirmRequest {
  tokenHash: string;
  type: ConfirmType;
  next: string;
}

const MAX_TOKEN_LENGTH = 256;

/**
 * Legge `token_hash`, `type` e `next` di un link di conferma (dall'indirizzo o dal modulo).
 * Restituisce `null` se il link non è ben formato: chi chiama rimanda al login.
 */
export function parseConfirmRequest(get: (name: string) => unknown): ConfirmRequest | null {
  const tokenHash = get("token_hash");
  const type = get("type");
  if (typeof tokenHash !== "string" || tokenHash === "" || tokenHash.length > MAX_TOKEN_LENGTH)
    return null;
  if (typeof type !== "string" || !CONFIRM_TYPES.includes(type as ConfirmType)) return null;
  const confirmType = type as ConfirmType;
  const next = get("next");
  return {
    tokenHash,
    type: confirmType,
    next: safeNextPath(
      typeof next === "string" ? next : null,
      DEFAULT_NEXT[confirmType] ?? "/dashboard",
    ),
  };
}
