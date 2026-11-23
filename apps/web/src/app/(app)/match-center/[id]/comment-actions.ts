"use server";

import { revalidatePath } from "next/cache";
import { COMMENT_RATE_LIMIT } from "@predictra/shared-types";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { parseCommentBody } from "@/lib/community/community";
import { createClient } from "@/lib/supabase/server";

function parseMatchId(raw: FormDataEntryValue | null): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Pubblica un commento. Utente attivo e limiti li ricontrolla il database (RLS e trigger). */
export async function addComment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().comments;
  await requireUser();
  const matchId = parseMatchId(formData.get("matchId"));
  const body = parseCommentBody(formData.get("body"));
  if (!matchId || !body) return { ok: false, message: m.invalid };

  const supabase = await createClient();
  const { error } = await supabase.from("match_comments").insert({ match_id: matchId, body });
  if (error) {
    if (error.message.includes(COMMENT_RATE_LIMIT)) return { ok: false, message: m.rateLimited };
    return { ok: false, message: getMessages().common.genericError };
  }
  revalidatePath(`/match-center/${matchId}`);
  return { ok: true, message: m.published };
}

/** Cancella un proprio commento (la RLS non lascia cancellare quelli altrui). */
export async function deleteComment(formData: FormData): Promise<void> {
  await requireUser();
  const matchId = parseMatchId(formData.get("matchId"));
  const commentId = parseMatchId(formData.get("commentId"));
  if (!matchId || !commentId) return;
  const supabase = await createClient();
  await supabase.from("match_comments").delete().eq("id", commentId);
  revalidatePath(`/match-center/${matchId}`);
}

/** Moderazione: un amministratore con 2FA cancella un commento altrui; resta nel registro. */
export async function moderateComment(formData: FormData): Promise<void> {
  await requireUser();
  const matchId = parseMatchId(formData.get("matchId"));
  const commentId = parseMatchId(formData.get("commentId"));
  if (!matchId || !commentId) return;
  const supabase = await createClient();
  await supabase.rpc("moderate_match_comment", { p_comment_id: commentId });
  revalidatePath(`/match-center/${matchId}`);
}
