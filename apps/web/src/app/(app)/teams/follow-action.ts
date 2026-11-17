"use server";

import { revalidatePath } from "next/cache";
import { FOLLOW_LIMIT, FOLLOW_LIMIT_REACHED } from "@predictra/shared-types";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { FOLLOW_COLUMN, parseFollowInput } from "@/lib/football/follow-input";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { createClient } from "@/lib/supabase/server";

const UNIQUE_VIOLATION = "23505";

/**
 * Inizia o smette di seguire una squadra o un campionato. Scrive con la sessione
 * dell'utente: la RLS lega la riga a chi è collegato e il database applica il limite.
 */
export async function setFollow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  await requireUser();
  const input = parseFollowInput((name) => formData.get(name));
  if (!input) return { ok: false, message: m.common.genericError };

  const supabase = await createClient();
  const column = FOLLOW_COLUMN[input.kind];
  if (input.follow) {
    const row: { team_id: number | null; competition_id: number | null } = {
      team_id: input.kind === "team" ? input.id : null,
      competition_id: input.kind === "competition" ? input.id : null,
    };
    const { error } = await supabase.from("user_follows").insert(row);
    // Già seguito (doppio tocco, altra scheda): va bene così.
    if (error && error.code !== UNIQUE_VIOLATION) {
      return {
        ok: false,
        message: error.message.includes(FOLLOW_LIMIT_REACHED)
          ? fillTemplate(m.follows.limit, { n: FOLLOW_LIMIT })
          : m.common.genericError,
      };
    }
  } else {
    const { error } = await supabase.from("user_follows").delete().eq(column, input.id);
    if (error) return { ok: false, message: m.common.genericError };
  }

  revalidatePath("/teams", "layout");
  revalidatePath("/dashboard");
  return { ok: true, message: "" };
}
