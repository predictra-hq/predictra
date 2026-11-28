"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_RATE_LIMIT,
} from "@predictra/shared-types";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  body: z.string().trim().min(FEEDBACK_MIN_LENGTH).max(FEEDBACK_MAX_LENGTH),
  // Pagina da cui si è partiti: solo un percorso interno, mai un indirizzo esterno.
  page: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)[^\s]*$/)
    .nullable(),
});

/** Feedback (ADR 0081): l'iscritto scrive un'idea, un problema o un apprezzamento. */
export async function sendFeedback(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().feedback;
  await requireUser();
  const page = formData.get("page");
  const parsed = schema.safeParse({
    kind: formData.get("kind"),
    body: formData.get("body"),
    page: typeof page === "string" && page ? page : null,
  });
  if (!parsed.success) return { ok: false, message: m.invalid };

  const supabase = await createClient();
  const { error } = await supabase.from("feedback").insert(parsed.data);
  if (error) {
    return {
      ok: false,
      message: error.message.includes(FEEDBACK_RATE_LIMIT)
        ? m.rateLimited
        : getMessages().common.genericError,
    };
  }
  revalidatePath("/feedback");
  return { ok: true, message: m.sent };
}
