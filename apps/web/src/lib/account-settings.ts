import { parseAlertThreshold, type AlertThreshold, ALERT_THRESHOLDS } from "@/lib/alerts";
import { THEMES, type Theme } from "@/lib/theme";

/*
 * Preferenze dell'app salvate nell'account (ADR 0067): tema, suoni e soglia degli avvisi
 * stanno in `user_dashboard_settings.settings` (RLS solo proprietario), così valgono su
 * ogni dispositivo. I cookie restano una copia locale per disegnare la pagina subito.
 */

export interface AccountSettings {
  theme?: Theme;
  sounds?: boolean;
  alertThreshold?: AlertThreshold;
}

/** Valori validi letti dal JSON del profilo; quelli mancanti o non validi restano assenti. */
export function readAccountSettings(settings: unknown): AccountSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const o = settings as Record<string, unknown>;
  const out: AccountSettings = {};
  if ((THEMES as readonly unknown[]).includes(o.theme)) out.theme = o.theme as Theme;
  if (typeof o.sounds === "boolean") out.sounds = o.sounds;
  if ((ALERT_THRESHOLDS as readonly unknown[]).includes(o.alert_threshold))
    out.alertThreshold = parseAlertThreshold(o.alert_threshold);
  return out;
}

/** Il JSON del profilo con le preferenze aggiornate; le altre chiavi restano com'erano. */
export function withAccountSettings(
  settings: unknown,
  patch: AccountSettings,
): Record<string, unknown> {
  const base =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  if (patch.theme !== undefined) base.theme = patch.theme;
  if (patch.sounds !== undefined) base.sounds = patch.sounds;
  if (patch.alertThreshold !== undefined) base.alert_threshold = patch.alertThreshold;
  return base;
}
