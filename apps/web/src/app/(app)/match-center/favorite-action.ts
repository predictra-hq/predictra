"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { FAVORITE_COMPETITION_COOKIE } from "@/lib/football/favorite";
import { parseCompetitionCode } from "@/lib/football/format";

/** Imposta o toglie il campionato preferito (cookie di questo browser). */
export async function setFavoriteCompetition(formData: FormData): Promise<void> {
  await requireUser();
  const raw = formData.get("code");
  const code = parseCompetitionCode(typeof raw === "string" ? raw : undefined);
  const jar = await cookies();
  if (code) {
    jar.set(FAVORITE_COMPETITION_COOKIE, code, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } else {
    jar.delete(FAVORITE_COMPETITION_COOKIE);
  }
  revalidatePath("/match-center");
  revalidatePath("/leagues");
}
