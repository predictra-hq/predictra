"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { getMessages, LOCALES } from "@/lib/i18n";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
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

/**
 * Tema dell'interfaccia: resta in un cookie di questo browser (non è un dato personale e
 * non passa dal database). Il layout lo legge e lo applica a `<html>`.
 */
export async function setTheme(formData: FormData): Promise<void> {
  await requireUser();
  const theme = parseTheme(formData.get("theme"));
  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
