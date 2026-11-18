"use server";

import { requireUser } from "@/lib/auth/dal";
import { withTourDone } from "@/lib/tour";
import { createClient } from "@/lib/supabase/server";

/**
 * Segna il tutorial come visto nel profilo dell'utente (`user_dashboard_settings.settings`,
 * RLS solo proprietario): non ricompare né dopo un nuovo accesso né su un altro dispositivo.
 * Il cookie del browser resta solo per non leggere il database quando c'è già.
 */
export async function completeTour(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_dashboard_settings")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();
  await supabase
    .from("user_dashboard_settings")
    .upsert({ user_id: user.id, settings: withTourDone(data?.settings) });
}
