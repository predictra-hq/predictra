"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/errors";
import { getMessages, LOCALES } from "@/lib/i18n";
import { ALERT_COOKIE, parseAlertThreshold } from "@/lib/alerts";
import { createClient } from "@/lib/supabase/server";
import { isAvatarStyle } from "@predictra/shared-types";
import { isAdult, parseBirthDate, parseNameStyle, todayInRome } from "@/lib/community/community";

const timezones = new Set(Intl.supportedValuesOf("timeZone"));

const schema = z.object({
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
    locale: formData.get("locale"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { ok: false, message: m.common.genericError };

  const supabase = await createClient();
  // RLS garantisce che si possa scrivere solo la propria riga.
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, locale: parsed.data.locale, timezone: parsed.data.timezone });
  if (error) return { ok: false, message: m.common.genericError };

  revalidatePath("/", "layout");
  return { ok: true, message: m.preferences.saved };
}

/** Nome utente (Il tuo profilo → Nome utente): lo vedono gli altri iscritti nei commenti. */
export async function saveDisplayName(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  const user = await requireUser();
  const parsed = z.string().trim().min(1).max(80).safeParse(formData.get("displayName"));
  if (!parsed.success) return { ok: false, message: m.account.nameInvalid };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data })
    .eq("id", user.id);
  if (error) return { ok: false, message: m.common.genericError };
  revalidatePath("/", "layout");
  return { ok: true, message: m.account.nameSaved };
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
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: isAdult(birthDate, todayInRome())
      ? m.preferences.birthdaySavedUnlocked
      : m.preferences.birthdaySaved,
  };
}

export async function removeBirthday(): Promise<ActionState> {
  const m = getMessages();
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("user_birthdays").delete().eq("user_id", user.id);
  if (error) return { ok: false, message: m.common.genericError };
  revalidatePath("/", "layout");
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
  // Tutto il layout: il nome compare anche nel menu laterale.
  revalidatePath("/", "layout");
  return { ok: true, message: m.preferences.nameStyleSaved };
}

/** Colore del cerchio dell'avatar, da un elenco chiuso; «automatico» lo toglie. */
export async function saveAvatarStyle(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  const user = await requireUser();
  const raw = formData.get("avatarStyle");
  const avatarStyle = isAvatarStyle(raw) ? raw : null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_style: avatarStyle })
    .eq("id", user.id);
  if (error) return { ok: false, message: m.common.genericError };
  revalidatePath("/", "layout");
  return { ok: true, message: m.preferences.avatarSaved };
}
