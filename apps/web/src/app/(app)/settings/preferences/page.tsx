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
import { SOUND_COOKIE } from "@/lib/sounds";
import { createClient } from "@/lib/supabase/server";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { savePreferences, setAlertThreshold } from "./actions";

export const metadata: Metadata = { title: "Preferenze dell'app" };

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
    <Card id={id} className="mb-4 max-w-lg scroll-mt-24">
      <CardTitle>{title}</CardTitle>
      <p className="mb-3 mt-1 text-sm text-muted">{hint}</p>
      {children}
    </Card>
  );
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
    .select("locale, timezone, odds_format")
    .eq("user_id", user.id)
    .maybeSingle();
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const alertThreshold = parseAlertThreshold(jar.get(ALERT_COOKIE)?.value);
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageHeader title={p.appTitle} description={p.appDescription} />
      <SettingsTabs current="preferences" />

      <Section id="theme" title={p.theme} hint={p.themeHint}>
        <ThemePicker initial={theme} labels={p.themes} />
      </Section>

      <Section id="sounds" title={p.sounds} hint={p.soundsHint}>
        <SoundToggle
          initial={jar.get(SOUND_COOKIE)?.value === "on"}
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
        <ActionForm action={savePreferences}>
          <Field label={p.language} htmlFor="locale">
            <Select id="locale" name="locale" defaultValue={prefs?.locale ?? "it"}>
              <option value="it">{p.italian}</option>
            </Select>
          </Field>
          <Field label={p.timezone} htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue={prefs?.timezone ?? "Europe/Rome"}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={p.oddsFormat} htmlFor="oddsFormat">
            <Select id="oddsFormat" disabled defaultValue="decimal">
              <option value="decimal">{p.decimal}</option>
            </Select>
          </Field>
          <SubmitButton>{m.common.save}</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
