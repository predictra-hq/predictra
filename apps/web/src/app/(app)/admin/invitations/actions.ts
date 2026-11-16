"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/dal";
import { generateAuthLink } from "@/lib/auth/links";
import { removeNeverActivatedUser } from "@/lib/auth/orphans";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, roleSchema, uuidSchema } from "@/lib/validation";

export async function createInvitation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  await requirePermission("invitations.manage");
  const email = emailSchema.safeParse(formData.get("email"));
  const role = roleSchema.safeParse(formData.get("role"));
  if (!email.success || !role.success) return { ok: false, message: m.common.genericError };

  // 1. Il database verifica ruolo, stato, 2FA, gerarchia e rate limit dell'attore.
  const supabase = await createClient();
  const { data: invitationId, error } = await supabase.rpc("create_invitation", {
    p_email: email.data,
    p_role: role.data,
  });
  if (error || typeof invitationId !== "string")
    return { ok: false, message: toUserMessage(error) };

  // 2. Solo dopo, generazione del link (nessuna email: lo consegna l'amministratore).
  const admin = createAdminClient();
  try {
    // Un utente rimasto a metà da un invito precedente (link aperto, account mai attivato)
    // impedirebbe di generare il nuovo link: si rimuove prima. La RPC ha già escluso che
    // l'email appartenga a un account con un ruolo.
    const { data: leftover } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email.data)
      .maybeSingle();
    if (typeof leftover?.id === "string") await removeNeverActivatedUser(admin, leftover.id);

    const link = await generateAuthLink("invite", email.data);
    await admin
      .from("invitations")
      .update({ sent_at: new Date().toISOString(), send_error: null, auth_user_id: link.userId })
      .eq("id", invitationId);
    revalidatePath("/admin/invitations");
    return { ok: true, message: m.admin.linkReady, link: link.url };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await admin
      .from("invitations")
      .update({ send_error: reason.slice(0, 500) })
      .eq("id", invitationId);
    revalidatePath("/admin/invitations");
    return { ok: false, message: `${m.admin.linkFailed}: ${reason}` };
  }
}

export async function revokeInvitation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  await requirePermission("invitations.manage");
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: m.common.genericError };

  const supabase = await createClient();
  const { data: authUserId, error } = await supabase.rpc("revoke_invitation", {
    p_invitation_id: id.data,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  // Invalida il link: elimina l'utente auth creato dall'invito, se non ha mai completato
  // l'attivazione (anche se il link è già stato aperto).
  if (typeof authUserId === "string") {
    await removeNeverActivatedUser(createAdminClient(), authUserId);
  }

  revalidatePath("/admin/invitations");
  return { ok: true, message: m.admin.revoked };
}
