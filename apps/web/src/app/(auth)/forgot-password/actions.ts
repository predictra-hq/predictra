"use server";

import type { ActionState } from "@/lib/errors";
import { serverEnv } from "@/lib/env.server";
import { getMessages } from "@/lib/i18n";
import { clientIp, consumeRateLimit, hashIdentifier } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validation";

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  const parsed = emailSchema.safeParse(formData.get("email"));
  // Stessa risposta in ogni caso: nessuna enumerazione degli account.
  const done: ActionState = { ok: true, message: m.auth.forgotSent };
  if (!parsed.success) return done;

  const ip = await clientIp();
  const [ipOk, emailOk] = await Promise.all([
    consumeRateLimit(`recovery:ip:${ip}`, 5, 60 * 60),
    consumeRateLimit(`recovery:email:${hashIdentifier(parsed.data)}`, 3, 60 * 60),
  ]);
  if (!ipOk || !emailOk) return { ok: false, message: m.auth.tooManyAttempts };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${serverEnv().APP_BASE_URL}/reset-password`,
  });
  return done;
}
