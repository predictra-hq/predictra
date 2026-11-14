import type { Metadata } from "next";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { savePreferences } from "./actions";

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
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageHeader title={m.preferences.title} />
      <SettingsTabs current="preferences" />
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
