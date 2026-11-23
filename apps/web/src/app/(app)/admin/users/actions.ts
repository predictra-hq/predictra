"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { generateAuthLink } from "@/lib/auth/links";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { roleSchema, uuidSchema } from "@/lib/validation";
import { parseNameStyle } from "@/lib/community/community";
import { isAvatarStyle } from "@predictra/shared-types";

const statusSchema = z.enum(["ACTIVE", "SUSPENDED"]);

/** Durata del ban Supabase per un account sospeso (~100 anni): revoca refresh e nuovi login. */
const SUSPENSION_BAN = "876000h";

export async function setAccountStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  await requirePermission("users.manage");
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const status = statusSchema.safeParse(formData.get("status"));
  if (!userId.success || !status.success) return { ok: false, message: m.common.genericError };

  // Il DB verifica permessi, gerarchia, 2FA e registra l'audit.
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_account_status", {
    p_user_id: userId.data,
    p_status: status.data,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  // Blocco a livello Auth: impedisce nuovi login e refresh dei token.
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId.data, {
    ban_duration: status.data === "SUSPENDED" ? SUSPENSION_BAN : "none",
  });

  revalidatePath("/admin/users");
  if (banError) return { ok: false, message: m.common.genericError };
  return { ok: true, message: m.admin.updated };
}

export async function setUserRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  await requirePermission("users.manage");
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const role = roleSchema.safeParse(formData.get("role"));
  if (!userId.success || !role.success) return { ok: false, message: m.common.genericError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_role", {
    p_user_id: userId.data,
    p_role: role.data,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath("/admin/users");
  return { ok: true, message: m.admin.updated };
}

/**
 * Profilo pubblico di un utente modificato da un amministratore (ADR 0067). Il database
 * ricontrolla 2FA, gerarchia dei ruoli e valori, e registra i campi cambiati.
 */
export async function adminUpdateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  await requirePermission("users.manage");
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const name = String(formData.get("displayName") ?? "").trim();
  if (!userId.success || name.length < 1 || name.length > 80)
    return { ok: false, message: m.account.nameInvalid };
  const style = parseNameStyle(formData.get("nameColor"), formData.get("nameStyle"));
  const avatar = formData.get("avatarStyle");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_profile", {
    p_user_id: userId.data,
    p_display_name: name,
    p_name_color: style.name_color,
    p_name_style: style.name_style,
    p_avatar_style: isAvatarStyle(avatar) ? avatar : null,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath("/admin/users");
  revalidatePath("/", "layout");
  return { ok: true, message: m.admin.updated };
}

/**
 * Genera un link di reimpostazione password da consegnare a mano (nessuna email).
 * Il database autorizza l'operazione (gerarchia, 2FA) e registra l'audit.
 */
export async function createPasswordResetLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  await requirePermission("users.manage");
  const userId = uuidSchema.safeParse(formData.get("userId"));
  if (!userId.success) return { ok: false, message: m.common.genericError };

  const supabase = await createClient();
  const { data: email, error } = await supabase.rpc("authorize_password_reset", {
    p_user_id: userId.data,
  });
  if (error || typeof email !== "string") return { ok: false, message: toUserMessage(error) };

  try {
    const link = await generateAuthLink("recovery", email);
    return { ok: true, message: m.admin.linkReady, link: link.url };
  } catch {
    return { ok: false, message: m.admin.linkFailed };
  }
}
