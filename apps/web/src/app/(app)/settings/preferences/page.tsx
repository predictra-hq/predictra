import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { SoundToggle } from "@/components/shell/sound-toggle";
import { ThemePicker } from "@/components/shell/theme-picker";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardTitle, Field, PageHeader, Select } from "@/components/ui/primitives";
import { ALERT_COOKIE, ALERT_THRESHOLDS, parseAlertThreshold } from "@/lib/alerts";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { SOUND_COOKIE, soundsOnFromCookie } from "@/lib/sounds";
import { createClient } from "@/lib/supabase/server";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { savePreferences, setAlertThreshold } from "./actions";

export const metadata: Metadata = { title: getMessages().pageTitles.settingsPreferences };

/** Riquadro con titolo e spiegazione; l'ancora è usata dalle voci del Profilo. */
function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24 p-4 sm:p-4">
      <CardTitle className="text-sm">{title}</CardTitle>
      <p className="mb-3 mt-0.5 text-xs text-muted">{hint}</p>
      {children}
    </Card>
  );
}

/** "Europe/Rome · 15:42 (GMT+1)": il fuso con l'ora che c'è adesso. */
function timezoneLabel(tz: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("it-IT", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "shortOffset",
    }).formatToParts(now);
    const time = parts
      .filter((x) => x.type === "hour" || x.type === "minute" || x.type === "literal")
      .map((x) => x.value)
      .join("")
      .trim();
    const offset = parts.find((x) => x.type === "timeZoneName")?.value ?? "";
    return `${tz.replaceAll("_", " ")} · ${time} (${offset})`;
  } catch {
    return tz;
  }
}

/**
 * Preferenze dell'app: come si comporta PREDICTRA su questo dispositivo e per te (tema,
 * suoni, avvisi in Home, lingua e fuso orario). Nome, immagine e compleanno stanno in
 * «Il tuo profilo» (`/settings/account`).
 */
export default async function PreferencesPage() {
  const m = getMessages();
  const p = m.preferences;
  const user = await requireUser();
  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const alertThreshold = parseAlertThreshold(jar.get(ALERT_COOKIE)?.value);
  const timezones = Intl.supportedValuesOf("timeZone");
  const now = new Date();

  return (
    <>
      <PageHeader title={p.appTitle} description={p.appDescription} />
      <SettingsTabs current="preferences" />

      {/* Riquadri affiancati dal computer: stessa larghezza delle altre pagine. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section id="theme" title={p.theme} hint={p.themeHint}>
          <ThemePicker initial={theme} labels={p.themes} />
        </Section>

        <Section id="sounds" title={p.sounds} hint={p.soundsHint}>
          <SoundToggle
            initial={soundsOnFromCookie(jar.get(SOUND_COOKIE)?.value)}
            labels={{ on: p.soundsOn, off: p.soundsOff }}
          />
        </Section>

        <Section id="alerts" title={p.alerts} hint={p.alertsHint}>
          <form action={setAlertThreshold} className="flex flex-wrap gap-2">
            {ALERT_THRESHOLDS.map((t) => (
              <button
                key={t}
                type="submit"
                name="threshold"
                value={t}
                aria-pressed={alertThreshold === t}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors",
                  alertThreshold === t
                    ? "border-positive/40 bg-positive-soft text-positive-strong"
                    : "border-border text-muted hover:text-fg",
                )}
              >
                {fillTemplate(p.alertsFrom, { n: t })}
              </button>
            ))}
          </form>
        </Section>

        <Section id="region" title={p.regionTitle} hint={p.regionHint}>
          <ActionForm action={savePreferences} trackChanges>
            {/* Lingua e formato delle quote hanno una sola scelta (italiano, decimale): niente
              campi da toccare, la lingua viaggia nascosta. */}
            <input type="hidden" name="locale" value="it" />
            <Field label={p.timezone} htmlFor="timezone">
              <Select id="timezone" name="timezone" defaultValue={prefs?.timezone ?? "Europe/Rome"}>
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {timezoneLabel(tz, now)}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton>{m.common.save}</SubmitButton>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
