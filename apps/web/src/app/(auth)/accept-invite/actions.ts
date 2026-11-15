"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { newPasswordSchema } from "@/lib/validation";

const nameSchema = z.string().trim().min(1).max(80);

export async function acceptInvite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  const user = await requireUser({ allowWithoutRole: true });
  if (user.roles.length > 0) redirect("/dashboard");

  const name = nameSchema.safeParse(formData.get("displayName"));
  const pwd = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!name.success) return { ok: false, message: m.common.genericError };
  if (!pwd.success)
    return { ok: false, message: pwd.error.issues[0]?.message ?? m.common.genericError };

  const supabase = await createClient();

  // Prima si riscatta l'invito (il DB verifica email, stato, scadenza e revoca).
  const { error: acceptError } = await supabase.rpc("accept_invitation");
  if (acceptError) return { ok: false, message: toUserMessage(acceptError) };

  const { error: pwdError } = await supabase.auth.updateUser({ password: pwd.data.password });
  if (pwdError) {
    return {
      ok: false,
      message: pwdError.code === "weak_password" ? pwdError.message : m.common.genericError,
    };
  }
  await supabase.from("profiles").update({ display_name: name.data }).eq("id", user.id);

  // Primo passo consigliato: attivare la 2FA.
  redirect("/settings/security?welcome=1");
}
