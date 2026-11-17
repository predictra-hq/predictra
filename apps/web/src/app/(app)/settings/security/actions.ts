"use server";

import { totpIssuer } from "@/lib/auth/totp";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { newPasswordSchema, totpCodeSchema } from "@/lib/validation";

export interface EnrollResult {
  ok: boolean;
  message?: string;
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

/** Avvia l'attivazione TOTP: restituisce QR (SVG data URI) e chiave segreta da mostrare una sola volta. */
export async function startTotpEnrollment(): Promise<EnrollResult> {
  const m = getMessages();
  await requireUser();
  const supabase = await createClient();

  // Rimuove eventuali fattori TOTP non verificati rimasti da tentativi precedenti.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "PREDICTRA",
    issuer: totpIssuer(process.env.APP_BASE_URL),
  });
  if (error || !data) return { ok: false, message: m.common.genericError };
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmTotpEnrollment(factorId: string, code: string): Promise<EnrollResult> {
  const m = getMessages();
  await requireUser();
  const parsed = totpCodeSchema.safeParse(code);
  if (!parsed.success) return { ok: false, message: m.auth.mfaInvalid };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data });
  if (error) return { ok: false, message: m.auth.mfaInvalid };
  revalidatePath("/", "layout");
  return { ok: true, message: m.security.mfaEnabled };
}

export async function removeTotp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  const user = await requireUser();
  if (!user.aal2) return { ok: false, message: m.auth.mfaInvalid };

  const supabase = await createClient();
  const factorId = String(formData.get("factorId") ?? "");
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, message: m.common.genericError };
  revalidatePath("/", "layout");
  return { ok: true, message: m.security.mfaRemoved };
}

export async function signOutOtherSessions(): Promise<ActionState> {
  const m = getMessages();
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, message: m.common.genericError };
  return { ok: true, message: m.security.signedOutOthers };
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  await requireUser();
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? m.common.genericError };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      ok: false,
      message: error.code === "weak_password" ? m.auth.passwordWeak : m.common.genericError,
    };
  }
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: m.security.passwordUpdated };
}
