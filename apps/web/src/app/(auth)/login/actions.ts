"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { clientIp, consumeRateLimit, hashIdentifier } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validation";

const schema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, message: m.auth.invalidCredentials };

  // Protezione brute force: per IP e per account (email hashata).
  const ip = await clientIp();
  const [ipOk, emailOk] = await Promise.all([
    consumeRateLimit(`login:ip:${ip}`, 20, 15 * 60),
    consumeRateLimit(`login:email:${hashIdentifier(parsed.data.email)}`, 5, 15 * 60),
  ]);
  if (!ipOk || !emailOk) return { ok: false, message: m.auth.tooManyAttempts };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Messaggio generico: non rivela se l'email esiste.
  if (error) return { ok: false, message: m.auth.invalidCredentials };

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  redirect(aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" ? "/mfa" : "/dashboard");
}
