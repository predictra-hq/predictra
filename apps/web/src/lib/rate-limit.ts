import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/** IP del client come visto dalla piattaforma (Vercel imposta x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Gli identificativi (email) non vengono salvati in chiaro nella tabella dei limiti. */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/**
 * Rate limiting persistente su Postgres (funzione public.consume_rate_limit,
 * eseguibile solo con chiave segreta). Se il limiter non risponde la richiesta
 * viene BLOCCATA (fail-closed).
 */
export async function consumeRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
