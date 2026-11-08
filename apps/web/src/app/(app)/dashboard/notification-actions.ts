"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/**
 * Segna come lette le notifiche dell'utente (M7 B3): una (`id`) o tutte.
 * La RLS consente l'aggiornamento di `read_at` solo sulle proprie notifiche;
 * un trigger impedisce di cambiare qualsiasi altra colonna.
 */
export async function markNotificationsRead(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages().agent;
  await requireUser();
  const rawId = formData.get("id");
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (rawId !== null && rawId !== "") {
    const id = idSchema.safeParse(rawId);
    if (!id.success) return { ok: false, message: getMessages().common.genericError };
    query = query.eq("id", id.data);
  }
  const { error } = await query;
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath("/dashboard");
  return { ok: true, message: m.marked };
}
