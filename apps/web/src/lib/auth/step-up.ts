import "server-only";
import { getMessages } from "@/lib/i18n";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
import type { createClient } from "@/lib/supabase/server";
import { totpCodeSchema } from "@/lib/validation";

/** Nome del campo con il codice TOTP nei moduli delle azioni distruttive. */
export const STEP_UP_FIELD = "stepUpCode";

/**
 * Step-up 2FA (ADR 0077). Se il modulo porta un codice, lo verifica sulla sessione aal2
 * corrente: Supabase aggiorna il momento del TOTP nel claim `amr` e `@supabase/ssr` riscrive
 * i cookie. Lo stesso `supabase` va poi usato per la RPC, che ha già il token nuovo.
 *
 * Senza codice non fa nulla: decide il database (`app_private.assert_recent_mfa`), che
 * rifiuta l'azione se l'ultimo codice è più vecchio di 5 minuti.
 *
 * Restituisce un messaggio d'errore da mostrare, oppure `null`.
 */
export async function refreshStepUp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
): Promise<string | null> {
  const raw = String(formData.get(STEP_UP_FIELD) ?? "").replace(/\s+/g, "");
  if (raw === "") return null;
  const m = getMessages();
  const code = totpCodeSchema.safeParse(raw);
  if (!code.success) return m.auth.mfaInvalid;

  const ip = await clientIp();
  const allowed = await consumeRateLimit(`mfa:user:${userId}:${ip}`, 10, 15 * 60);
  if (!allowed) return m.auth.tooManyAttempts;

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) return m.auth.mfaInvalid;
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code.data,
  });
  return error ? m.auth.mfaInvalid : null;
}
