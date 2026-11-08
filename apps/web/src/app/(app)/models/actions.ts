"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  modelVersionId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

/**
 * Attiva una versione di modello. Il database ricontrolla Super Admin, account
 * attivo, sessione 2FA e backtest migliore della baseline
 * (`set_active_model_version`), e registra l'operazione in audit.
 */
export async function activateModelVersion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  await requirePermission("models.manage");
  const parsed = schema.safeParse({ modelVersionId: formData.get("modelVersionId") });
  if (!parsed.success) return { ok: false, message: m.common.genericError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_model_version", {
    p_model_version_id: parsed.data.modelVersionId,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath("/models");
  return { ok: true, message: m.modelIntelligence.activated };
}
