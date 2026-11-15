"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { getMessages, LOCALES } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

const timezones = new Set(Intl.supportedValuesOf("timeZone"));

const schema = z.object({
  displayName: z.string().trim().min(1).max(80),
  locale: z.enum(LOCALES),
  timezone: z.string().refine((tz) => timezones.has(tz)),
});

export async function savePreferences(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  const user = await requireUser();
  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
    locale: formData.get("locale"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { ok: false, message: m.common.genericError };

  const supabase = await createClient();
  // RLS garantisce che si possa scrivere solo la propria riga.
  const [profile, prefs] = await Promise.all([
    supabase.from("profiles").update({ display_name: parsed.data.displayName }).eq("id", user.id),
    supabase
      .from("user_preferences")
      .upsert({ user_id: user.id, locale: parsed.data.locale, timezone: parsed.data.timezone }),
  ]);
  if (profile.error || prefs.error) return { ok: false, message: m.common.genericError };

  revalidatePath("/", "layout");
  return { ok: true, message: m.preferences.saved };
}
