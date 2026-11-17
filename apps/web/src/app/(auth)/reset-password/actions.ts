"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { newPasswordSchema } from "@/lib/validation";

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? m.common.genericError };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?error=link");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    // Con 2FA attiva Supabase può richiedere una sessione aal2 per il cambio password.
    if (error.code === "insufficient_aal") redirect("/mfa?next=/reset-password");
    if (error.code === "weak_password") return { ok: false, message: m.auth.passwordWeak };
    return { ok: false, message: m.common.genericError };
  }
  // Dopo il reset chiude le sessioni su tutti gli altri dispositivi.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/dashboard");
}
