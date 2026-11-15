"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

const aliasSchema = z.object({
  teamId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  alias: z.string().trim().min(1).max(120),
});

/**
 * Salva un alias manuale per un nome ricevuto da The Odds API. Il database
 * ricontrolla Super Admin, account attivo e sessione 2FA (`add_team_alias`) e
 * registra l'operazione in audit.
 */
export async function addTeamAlias(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().teamAliases;
  await requirePermission("providers.manage");
  const parsed = aliasSchema.safeParse({
    teamId: formData.get("teamId"),
    alias: formData.get("alias"),
  });
  if (!parsed.success) return { ok: false, message: m.invalid };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_team_alias", {
    p_team_id: parsed.data.teamId,
    p_alias: parsed.data.alias,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, message: m.duplicate };
    if (error.code === "23503") return { ok: false, message: m.invalid };
    return { ok: false, message: toUserMessage(error) };
  }

  revalidatePath("/admin/team-aliases");
  return { ok: true, message: m.saved };
}
