"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath, totpCodeSchema } from "@/lib/validation";

export async function verifyMfa(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  const code = totpCodeSchema.safeParse(formData.get("code"));
  if (!code.success) return { ok: false, message: m.auth.mfaInvalid };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const ip = await clientIp();
  const allowed = await consumeRateLimit(`mfa:user:${userId}:${ip}`, 10, 15 * 60);
  if (!allowed) return { ok: false, message: m.auth.tooManyAttempts };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) redirect("/dashboard");

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code.data,
  });
  if (error) return { ok: false, message: m.auth.mfaInvalid };

  redirect(safeNextPath(String(formData.get("next") ?? "")));
}
