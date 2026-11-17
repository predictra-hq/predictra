"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { getMessages, LOCALES } from "@/lib/i18n";
import { ALERT_COOKIE, parseAlertThreshold } from "@/lib/alerts";
import { createClient } from "@/lib/supabase/server";
import { parseBirthDate, parseNameStyle, todayInRome } from "@/lib/community/community";

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

/** Soglia degli avvisi in Home: preferenza di questo browser, come il tema. */
export async function setAlertThreshold(formData: FormData): Promise<void> {
  await requireUser();
  const threshold = parseAlertThreshold(formData.get("threshold"));
  (await cookies()).set(ALERT_COOKIE, String(threshold), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/dashboard");
  revalidatePath("/settings/preferences");
}

/** Data di nascita (ADR 0058): solo il proprietario la legge; il database ricontrolla la data. */
export async function saveBirthday(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  const user = await requireUser();
  const birthDate = parseBirthDate(formData.get("birthDate"), todayInRome());
  if (!birthDate) return { ok: false, message: m.preferences.birthdayInvalid };
  const supabase = await createClient();
  const { error } = await supabase.from("user_birthdays").upsert({
    user_id: user.id,
    birth_date: birthDate,
    show_birthday: formData.get("showBirthday") === "on",
  });
  if (error) return { ok: false, message: m.common.genericError };
  revalidatePath("/settings/preferences");
  revalidatePath("/dashboard");
  return { ok: true, message: m.preferences.birthdaySaved };
}

export async function removeBirthday(): Promise<ActionState> {
  const m = getMessages();
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("user_birthdays").delete().eq("user_id", user.id);
  if (error) return { ok: false, message: m.common.genericError };
  revalidatePath("/settings/preferences");
  revalidatePath("/dashboard");
  return { ok: true, message: m.preferences.birthdayRemoved };
}

/** Colore e scritta del nome, da elenchi chiusi (vincoli anche nel database). */
export async function saveNameStyle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  const user = await requireUser();
  const style = parseNameStyle(formData.get("nameColor"), formData.get("nameStyle"));
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(style).eq("id", user.id);
  if (error) return { ok: false, message: m.common.genericError };
  revalidatePath("/settings/preferences");
  return { ok: true, message: m.preferences.nameStyleSaved };
}
