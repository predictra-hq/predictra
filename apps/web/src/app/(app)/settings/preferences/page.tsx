import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { parseTheme, THEME_COOKIE, THEMES } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { ALERT_COOKIE, ALERT_THRESHOLDS, parseAlertThreshold } from "@/lib/alerts";
import { fillTemplate } from "@/lib/odds/format";
import { savePreferences, setAlertThreshold, setTheme } from "./actions";

export const metadata: Metadata = { title: "Preferenze" };

export default async function PreferencesPage() {
  const m = getMessages();
  const user = await requireUser();
  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("locale, timezone, odds_format")
    .eq("user_id", user.id)
    .maybeSingle();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const alertThreshold = parseAlertThreshold((await cookies()).get(ALERT_COOKIE)?.value);
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageHeader title={m.preferences.title} />
      <SettingsTabs current="preferences" />
      <Card className="mb-4 max-w-lg">
        <CardTitle>{m.preferences.theme}</CardTitle>
        <p className="mb-3 mt-1 text-sm text-muted">{m.preferences.themeHint}</p>
        <form action={setTheme} className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t}
              type="submit"
              name="theme"
              value={t}
              aria-pressed={theme === t}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors",
                theme === t
                  ? "border-positive/40 bg-positive-soft text-positive-strong"
                  : "border-border text-muted hover:text-fg",
              )}
            >
              {m.preferences.themes[t]}
            </button>
          ))}
        </form>
      </Card>
      <Card className="mb-4 max-w-lg">
        <CardTitle>{m.preferences.alerts}</CardTitle>
        <p className="mb-3 mt-1 text-sm text-muted">{m.preferences.alertsHint}</p>
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
              {fillTemplate(m.preferences.alertsFrom, { n: t })}
            </button>
          ))}
        </form>
      </Card>
      <Card className="max-w-lg">
        <ActionForm action={savePreferences}>
          <Field label={m.preferences.displayName} htmlFor="displayName">
            <Input
              id="displayName"
              name="displayName"
              defaultValue={user.displayName ?? ""}
              maxLength={80}
              required
            />
          </Field>
          <Field label={m.preferences.language} htmlFor="locale">
            <Select id="locale" name="locale" defaultValue={prefs?.locale ?? "it"}>
              <option value="it">{m.preferences.italian}</option>
            </Select>
          </Field>
          <Field label={m.preferences.timezone} htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue={prefs?.timezone ?? "Europe/Rome"}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={m.preferences.oddsFormat} htmlFor="oddsFormat">
            <Select id="oddsFormat" disabled defaultValue="decimal">
              <option value="decimal">{m.preferences.decimal}</option>
            </Select>
          </Field>
          <SubmitButton>{m.common.save}</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
