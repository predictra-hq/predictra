import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { ThemePicker } from "@/components/shell/theme-picker";
import { SoundToggle } from "@/components/shell/sound-toggle";
import { SOUND_COOKIE } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { ALERT_COOKIE, ALERT_THRESHOLDS, parseAlertThreshold } from "@/lib/alerts";
import { fillTemplate } from "@/lib/odds/format";
import { NAME_COLORS, NAME_STYLES } from "@predictra/shared-types";
import { StyledName } from "@/components/community/styled-name";
import { getOwnCommunityProfile } from "@/lib/community/queries";
import { todayInRome } from "@/lib/community/community";
import { removeBirthday, saveAvatarColor, saveBirthday, saveNameStyle } from "./actions";
import { AVATAR_COLOR_KEYS } from "@predictra/shared-types";
import { UserAvatar } from "@/components/ui/user-avatar";
import Link from "next/link";
import { isAdult } from "@/lib/community/community";
import { savePreferences, setAlertThreshold } from "./actions";

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
  const community = await getOwnCommunityProfile(user.id);
  const p = m.preferences;

  return (
    <>
      <PageHeader title={m.preferences.title} />
      <SettingsTabs current="preferences" />
      <Card className="mb-4 max-w-lg">
        <CardTitle>{m.preferences.theme}</CardTitle>
        <p className="mb-3 mt-1 text-sm text-muted">{m.preferences.themeHint}</p>
        <ThemePicker initial={theme} labels={m.preferences.themes} />
      </Card>
      <Card className="mb-4 max-w-lg">
        <CardTitle>{m.preferences.sounds}</CardTitle>
        <p className="mb-3 mt-1 text-sm text-muted">{m.preferences.soundsHint}</p>
        <SoundToggle
          initial={(await cookies()).get(SOUND_COOKIE)?.value === "on"}
          labels={{ on: m.preferences.soundsOn, off: m.preferences.soundsOff }}
        />
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

      <Card id="birthday" className="mt-4 max-w-lg scroll-mt-24">
        <CardTitle>{p.birthday}</CardTitle>
        <p className="mb-3 mt-1 text-sm text-muted">{p.birthdayHint}</p>
        <p
          className={
            isAdult(community.birthDate, todayInRome())
              ? "mb-3 rounded-lg border border-positive/40 bg-positive-soft px-3 py-2 text-sm text-positive-strong"
              : "mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted"
          }
        >
          {isAdult(community.birthDate, todayInRome()) ? (
            <>
              {p.commentsUnlocked}{" "}
              <Link href="/discussions" className="font-medium underline underline-offset-2">
                {p.commentsOpen}
              </Link>
            </>
          ) : (
            p.commentsLocked
          )}
        </p>
        <ActionForm action={saveBirthday}>
          <Field label={p.birthday} htmlFor="birthDate">
            <Input
              id="birthDate"
              name="birthDate"
              type="date"
              min="1900-01-01"
              max={todayInRome()}
              defaultValue={community.birthDate ?? ""}
              required
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="showBirthday"
              defaultChecked={community.showBirthday}
              className="mt-0.5 size-4"
            />
            {p.birthdayShow}
          </label>
          <SubmitButton>{m.common.save}</SubmitButton>
        </ActionForm>
        {community.birthDate ? (
          <ActionForm action={removeBirthday} className="mt-2">
            <SubmitButton variant="ghost">{p.birthdayRemove}</SubmitButton>
          </ActionForm>
        ) : null}
      </Card>

      <Card className="mt-4 max-w-lg">
        <CardTitle>{p.avatar}</CardTitle>
        <p className="mb-3 mt-1 text-sm text-muted">{p.avatarHint}</p>
        <ActionForm action={saveAvatarColor}>
          <fieldset>
            <legend className="sr-only">{p.avatar}</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...AVATAR_COLOR_KEYS].map((c) => (
                <label
                  key={c ?? "auto"}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-border p-2 text-xs has-[:checked]:border-positive has-[:checked]:bg-positive-soft"
                >
                  <input
                    type="radio"
                    name="avatarColor"
                    value={c ?? "auto"}
                    defaultChecked={(user.avatarColor ?? null) === c}
                    className="sr-only"
                  />
                  <UserAvatar userId={user.id} color={c} className="size-10" />
                  {c ? p.avatarColors[c] : p.avatarAuto}
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton>{m.common.save}</SubmitButton>
        </ActionForm>
      </Card>

      <Card className="mt-4 max-w-lg">
        <CardTitle>{p.nameStyle}</CardTitle>
        <p className="mb-3 mt-1 text-sm text-muted">{p.nameStyleHint}</p>
        <p className="mb-4 text-sm">
          <span className="text-muted">{p.namePreview}: </span>
          <StyledName
            name={user.displayName ?? user.email.split("@")[0]!}
            color={community.nameColor}
            style={community.nameStyle}
          />
        </p>
        <ActionForm action={saveNameStyle}>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{p.nameColor}</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...NAME_COLORS].map((c) => (
                <label
                  key={c ?? "default"}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-positive has-[:checked]:bg-positive-soft"
                >
                  <input
                    type="radio"
                    name="nameColor"
                    value={c ?? "default"}
                    defaultChecked={community.nameColor === c}
                    className="sr-only"
                  />
                  <StyledName name={c ? p.nameColors[c] : p.nameDefault} color={c} style={null} />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{p.nameFont}</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...NAME_STYLES].map((s) => (
                <label
                  key={s ?? "default"}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-positive has-[:checked]:bg-positive-soft"
                >
                  <input
                    type="radio"
                    name="nameStyle"
                    value={s ?? "default"}
                    defaultChecked={community.nameStyle === s}
                    className="sr-only"
                  />
                  <StyledName name={s ? p.nameStyles[s] : p.nameDefault} color={null} style={s} />
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton>{m.common.save}</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
