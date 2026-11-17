"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { FAVORITE_COMPETITION_COOKIE } from "@/lib/football/favorite";
import { parseCompetitionCode } from "@/lib/football/format";
import { createClient } from "@/lib/supabase/server";

/** Segue o smette di seguire il campionato, così il preferito vale anche sugli altri dispositivi. */
async function mirrorFollow(code: string, follow: boolean): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("competitions").select("id").eq("code", code).maybeSingle();
  if (typeof data?.id !== "number") return;
  // Aiuto alla navigazione: se la scrittura non riesce resta comunque il cookie.
  if (follow) await supabase.from("user_follows").insert({ competition_id: data.id });
  else await supabase.from("user_follows").delete().eq("competition_id", data.id);
}

/** Imposta o toglie il campionato preferito (cookie di questo browser e campionati seguiti). */
export async function setFavoriteCompetition(formData: FormData): Promise<void> {
  await requireUser();
  const raw = formData.get("code");
  const code = parseCompetitionCode(typeof raw === "string" ? raw : undefined);
  const rawCurrent = formData.get("current");
  const current = parseCompetitionCode(typeof rawCurrent === "string" ? rawCurrent : undefined);
  const jar = await cookies();
  if (code) {
    jar.set(FAVORITE_COMPETITION_COOKIE, code, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    await mirrorFollow(code, true);
  } else {
    jar.delete(FAVORITE_COMPETITION_COOKIE);
    if (current) await mirrorFollow(current, false);
  }
  revalidatePath("/match-center");
  revalidatePath("/leagues");
}
