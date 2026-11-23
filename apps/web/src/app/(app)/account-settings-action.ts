"use server";

import { requireUser } from "@/lib/auth/dal";
import { readAccountSettings, withAccountSettings } from "@/lib/account-settings";
import { createClient } from "@/lib/supabase/server";

/**
 * Salva tema, suoni o soglia degli avvisi nell'account (ADR 0067), con RLS solo
 * proprietario. Si accettano solo valori validi: il resto viene ignorato.
 */
export async function saveAccountSettings(patch: unknown): Promise<void> {
  const user = await requireUser();
  const clean = readAccountSettings(
    patch && typeof patch === "object"
      ? {
          theme: (patch as Record<string, unknown>).theme,
          sounds: (patch as Record<string, unknown>).sounds,
          alert_threshold: (patch as Record<string, unknown>).alertThreshold,
        }
      : {},
  );
  if (Object.keys(clean).length === 0) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_dashboard_settings")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();
  await supabase
    .from("user_dashboard_settings")
    .upsert({ user_id: user.id, settings: withAccountSettings(data?.settings, clean) });
}
