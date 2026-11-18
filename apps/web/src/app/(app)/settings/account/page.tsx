import type { Metadata } from "next";
import Link from "next/link";
import { AVATAR_STYLES, NAME_COLORS, NAME_STYLES } from "@predictra/shared-types";
import { StyledName } from "@/components/community/styled-name";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardTitle, Field, Input, PageHeader } from "@/components/ui/primitives";
import { UserAvatar } from "@/components/ui/user-avatar";
import { requireUser } from "@/lib/auth/dal";
import { isAdult, todayInRome } from "@/lib/community/community";
import { getOwnCommunityProfile } from "@/lib/community/queries";
import { getMessages } from "@/lib/i18n";
import { avatarStyleOf } from "@/lib/profile/avatar";
import {
  removeBirthday,
  saveAvatarStyle,
  saveBirthday,
  saveDisplayName,
  saveNameStyle,
} from "../preferences/actions";

export const metadata: Metadata = { title: "Il tuo profilo" };

/** Riquadro con titolo e una frase che dice a cosa serve: ogni voce del Profilo porta qui. */
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
      <p className="mb-4 mt-1 text-sm text-muted">{hint}</p>
      {children}
    </Card>
  );
}

/**
 * Il tuo profilo: come ti vedono gli altri iscritti. Nome utente, immagine, stile del nome e
 * data di nascita (che sblocca i commenti). Ogni riquadro ha un'ancora (`#name`, `#avatar`,
 * `#name-style`, `#birthday`) usata dalle voci del Profilo.
 */
export default async function AccountPage() {
  const user = await requireUser();
  const m = getMessages();
  const p = m.preferences;
  const a = m.account;
  const community = await getOwnCommunityProfile(user.id);
  const adult = isAdult(community.birthDate, todayInRome());
  const shownName = user.displayName ?? user.email.split("@")[0]!;

  return (
    <>
      <PageHeader title={a.title} description={a.description} />
      <SettingsTabs current="account" />

      <Section id="name" title={a.nameTitle} hint={a.nameHint}>
        <ActionForm action={saveDisplayName}>
          <Field label={a.nameLabel} htmlFor="displayName">
            <Input
              id="displayName"
              name="displayName"
              defaultValue={user.displayName ?? ""}
              maxLength={80}
              autoComplete="nickname"
              required
            />
          </Field>
          <SubmitButton>{m.common.save}</SubmitButton>
        </ActionForm>
      </Section>

      <Section id="avatar" title={a.avatarTitle} hint={p.avatarHint}>
        <ActionForm action={saveAvatarStyle}>
          <fieldset>
            <legend className="sr-only">{a.avatarTitle}</legend>
            <div className="flex flex-wrap gap-2">
              {/* Solo immagini, senza scritte sotto: il nome del tipo è per i lettori di
                  schermo e nel suggerimento, così la griglia resta regolare. */}
              {AVATAR_STYLES.map((s) => (
                <label
                  key={s}
                  title={p.avatarStyles[s]}
                  className="cursor-pointer rounded-full p-1 ring-2 ring-transparent transition-shadow has-[:checked]:ring-positive has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-positive"
                >
                  <input
                    type="radio"
                    name="avatarStyle"
                    value={s}
                    defaultChecked={avatarStyleOf(user.avatarStyle) === s}
                    className="sr-only"
                  />
                  <span className="sr-only">{p.avatarStyles[s]}</span>
                  <UserAvatar style={s} name={shownName} className="size-12" />
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton>{m.common.save}</SubmitButton>
        </ActionForm>
      </Section>

      <Section id="name-style" title={p.nameStyle} hint={p.nameStyleHint}>
        <p className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">{p.namePreview}: </span>
          <StyledName name={shownName} color={community.nameColor} style={community.nameStyle} />
        </p>
        <ActionForm action={saveNameStyle}>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{p.nameColor}</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...NAME_COLORS].map((c) => (
                <label
                  key={c ?? "default"}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-positive has-[:checked]:bg-positive-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-positive"
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
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-positive has-[:checked]:bg-positive-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-positive"
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
      </Section>

      <Section id="birthday" title={p.birthday} hint={p.birthdayHint}>
        <p
          className={
            adult
              ? "mb-4 rounded-lg border border-positive/40 bg-positive-soft px-3 py-2 text-sm text-positive-strong"
              : "mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted"
          }
        >
          {adult ? (
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
      </Section>
    </>
  );
}
