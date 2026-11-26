"use server";

import { revalidatePath } from "next/cache";
import {
  COMMENT_RATE_LIMIT,
  COMMUNITY_CHANNELS,
  POST_COOLDOWN,
  REACTION_EMOJIS,
  type CommunityChannel,
} from "@predictra/shared-types";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { parseCommentBody } from "@/lib/community/community";
import { parseSharedSlip } from "@/lib/community/slip";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@predictra/shared-types";

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
  // Nella chat Schedine solo schedine condivise (ADR 0070).
  if (channel === "SLIPS") return { ok: false, message: m.slipsOnly };
  const supabase = await createClient();
  const { error } = await supabase.from("community_posts").insert({ channel, body });
  if (error) return postFailure(supabase, error.message);
  revalidatePath("/locker-room");
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
  const { error } = await supabase
    .from("community_posts")
    .insert({ channel: "SLIPS", body, slip: slip as unknown as Json });
  if (error) return postFailure(supabase, error.message);
  revalidatePath("/locker-room");
  return { ok: true, message: m.shared };
}

/** Attesa tra due messaggi (ADR 0071), come nel trigger `check_community_posts_rate`. */
const COOLDOWN_MS = 2 * 60_000;

/**
 * Esito per l'utente dagli errori del database sui messaggi. Con l'attesa dice anche da
 * quando si può riscrivere: l'ora dell'ultimo messaggio proprio (la RLS lascia leggere i
 * propri) più 2 minuti.
 */
async function postFailure(
  supabase: Awaited<ReturnType<typeof createClient>>,
  message: string,
): Promise<ActionState> {
  const m = getMessages().community;
  if (message.includes(POST_COOLDOWN)) {
    const { data } = await supabase
      .from("community_posts")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = Date.parse(String(data?.created_at ?? ""));
    return Number.isFinite(last)
      ? { ok: false, message: m.cooldown, retryAt: new Date(last + COOLDOWN_MS).toISOString() }
      : { ok: false, message: m.cooldown };
  }
  if (message.includes(COMMENT_RATE_LIMIT)) return { ok: false, message: m.rateLimited };
  return { ok: false, message: getMessages().common.genericError };
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
  revalidatePath("/locker-room");
}

/** Moderazione: un amministratore con 2FA cancella un messaggio altrui; resta nel registro. */
export async function moderatePost(formData: FormData): Promise<void> {
  await requireUser();
  const id = idOf(formData.get("postId"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("moderate_community_post", { p_post_id: id });
  revalidatePath("/locker-room");
}

/**
 * Reazione con un'emoji a un messaggio (ADR 0070): la aggiunge, o la toglie se c'era già.
 * Elenco delle emoji e proprietà li ricontrolla il database.
 */
export async function toggleReaction(formData: FormData): Promise<void> {
  await requireUser();
  const id = idOf(formData.get("postId"));
  const emoji = String(formData.get("emoji") ?? "");
  if (!id || !(REACTION_EMOJIS as readonly string[]).includes(emoji)) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_reactions")
    .delete()
    .eq("post_id", id)
    .eq("emoji", emoji)
    .select("post_id");
  if (!data || data.length === 0) {
    await supabase.from("community_reactions").insert({ post_id: id, emoji });
  }
  revalidatePath("/locker-room");
}
