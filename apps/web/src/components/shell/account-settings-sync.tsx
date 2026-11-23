"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { applyTheme } from "@/components/shell/theme-picker";
import type { AccountSettings } from "@/lib/account-settings";
import { ALERT_COOKIE } from "@/lib/alerts";
import { setSoundsEnabled, SOUND_COOKIE } from "@/lib/sounds";
import { THEME_COOKIE } from "@/lib/theme";

function cookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * Allinea questo dispositivo alle preferenze salvate nell'account (ADR 0067): su un
 * telefono nuovo o dopo un cambio fatto altrove, tema, suoni e avvisi diventano quelli
 * scelti. Non disegna nulla.
 */
export function AccountSettingsSync({ settings }: { settings: AccountSettings }) {
  const router = useRouter();
  useEffect(() => {
    if (settings.theme && cookie(THEME_COOKIE) !== settings.theme) applyTheme(settings.theme);
    if (settings.sounds !== undefined && cookie(SOUND_COOKIE) !== (settings.sounds ? "on" : "off"))
      setSoundsEnabled(settings.sounds);
    if (settings.alertThreshold && cookie(ALERT_COOKIE) !== String(settings.alertThreshold)) {
      const secure = location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${ALERT_COOKIE}=${settings.alertThreshold}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
      router.refresh();
    }
  }, [settings, router]);
  return null;
}
