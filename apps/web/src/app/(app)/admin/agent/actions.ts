"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

const retrySchema = z.object({
  jobId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

/**
 * Ripresa manuale di un job in dead-letter (M7 B2). Il database ricontrolla
 * `agents.monitor`, account attivo e sessione 2FA (`retry_dead_agent_job`) e
 * registra l'operazione in audit (`agent.job_retried`).
 */
export async function retryDeadJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().agent;
  await requirePermission("agents.monitor");
  const parsed = retrySchema.safeParse({ jobId: formData.get("jobId") });
  if (!parsed.success) return { ok: false, message: m.retryInvalid };

  const supabase = await createClient();
  const { error } = await supabase.rpc("retry_dead_agent_job", { p_job_id: parsed.data.jobId });
  if (error) return { ok: false, message: toUserMessage(error) };

  revalidatePath("/admin/agent");
  return { ok: true, message: m.retried };
}
