"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/dal";
import { serverEnv } from "@/lib/env.server";
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

  // 2. Solo dopo, invio dell'email con la chiave segreta (Auth Admin API).
  const admin = createAdminClient();
  const { data: invited, error: sendError } = await admin.auth.admin.inviteUserByEmail(email.data, {
    redirectTo: `${serverEnv().APP_BASE_URL}/accept-invite`,
  });
  await admin
    .from("invitations")
    .update(
      sendError
        ? { send_error: sendError.message.slice(0, 500) }
        : {
            sent_at: new Date().toISOString(),
            send_error: null,
            auth_user_id: invited.user?.id ?? null,
          },
    )
    .eq("id", invitationId);

  revalidatePath("/admin/invitations");
  if (sendError) return { ok: false, message: `${m.admin.sendFailed}: ${sendError.message}` };
  return { ok: true, message: m.admin.sent };
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

  // Invalida il link: elimina l'utente auth creato dall'invito, se non ha mai effettuato l'accesso.
  if (typeof authUserId === "string") {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(authUserId);
    if (data.user && !data.user.last_sign_in_at) {
      await admin.auth.admin.deleteUser(authUserId);
    }
  }

  revalidatePath("/admin/invitations");
  return { ok: true, message: m.admin.revoked };
}
