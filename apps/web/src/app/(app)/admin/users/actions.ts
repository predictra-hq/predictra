"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { roleSchema, uuidSchema } from "@/lib/validation";

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
