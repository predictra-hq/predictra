"use server";

import { revalidatePath } from "next/cache";
import {
  COMMENT_RATE_LIMIT,
  COMMUNITY_CHANNELS,
  type CommunityChannel,
} from "@predictra/shared-types";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { parseCommentBody } from "@/lib/community/community";
import { parseSharedSlip } from "@/lib/community/slip";
import { createClient } from "@/lib/supabase/server";

const channelOf = (raw: FormDataEntryValue | null): CommunityChannel | null =>
  (COMMUNITY_CHANNELS as readonly string[]).includes(String(raw))
    ? (raw as CommunityChannel)
    : null;

/** Messaggio nella chat (ADR 0064); limiti e permessi li ricontrolla il database. */
export async function postMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().community;
  await requireUser();
  const channel = channelOf(formData.get("channel"));
  const body = parseCommentBody(formData.get("body"));
  if (!channel || !body) return { ok: false, message: m.invalid };
  const supabase = await createClient();
  const { error } = await supabase.from("community_posts").insert({ channel, body });
  if (error) {
    return {
      ok: false,
      message: error.message.includes(COMMENT_RATE_LIMIT)
        ? m.rateLimited
        : getMessages().common.genericError,
    };
  }
  revalidatePath("/community");
  return { ok: true, message: m.published };
}

/** Condivide una schedina nella chat «Schedine», con un messaggio facoltativo. */
export async function shareSlip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().community;
  await requireUser();
  const slip = parseSharedSlip(formData.get("slip"));
  const raw = formData.get("body");
  const body = typeof raw === "string" && raw.trim() ? parseCommentBody(raw) : "";
  if (!slip || body === null) return { ok: false, message: m.invalid };
  const supabase = await createClient();
  const { error } = await supabase.from("community_posts").insert({ channel: "SLIPS", body, slip });
  if (error) {
    return {
      ok: false,
      message: error.message.includes(COMMENT_RATE_LIMIT)
        ? m.rateLimited
        : getMessages().common.genericError,
    };
  }
  revalidatePath("/community");
  return { ok: true, message: m.shared };
}

const idOf = (raw: FormDataEntryValue | null) => {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** Cancella un proprio messaggio (la RLS non lascia cancellare quelli altrui). */
export async function deletePost(formData: FormData): Promise<void> {
  await requireUser();
  const id = idOf(formData.get("postId"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("community_posts").delete().eq("id", id);
  revalidatePath("/community");
}

/** Moderazione: un amministratore con 2FA cancella un messaggio altrui; resta nel registro. */
export async function moderatePost(formData: FormData): Promise<void> {
  await requireUser();
  const id = idOf(formData.get("postId"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("moderate_community_post", { p_post_id: id });
  revalidatePath("/community");
}
