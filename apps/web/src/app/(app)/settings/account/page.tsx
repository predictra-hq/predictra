import type { Metadata } from "next";
import { AVATAR_STYLES, NAME_COLORS, NAME_STYLES } from "@predictra/shared-types";
import { StyledName } from "@/components/community/styled-name";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardTitle, Field, Input, PageHeader } from "@/components/ui/primitives";
import { UserAvatar } from "@/components/ui/user-avatar";
import { requireUser } from "@/lib/auth/dal";
import { getOwnCommunityProfile } from "@/lib/community/queries";
import { getMessages } from "@/lib/i18n";
import { avatarStyleOf } from "@/lib/profile/avatar";
import { saveAvatarStyle, saveDisplayName, saveNameStyle } from "../preferences/actions";

export const metadata: Metadata = { title: getMessages().pageTitles.settingsAccount };

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
    <Card id={id} className="scroll-mt-24 p-4 sm:p-4">
      <CardTitle className="text-sm">{title}</CardTitle>
      <p className="mb-3 mt-0.5 text-xs text-muted">{hint}</p>
      {children}
    </Card>
  );
}

/**
 * Il tuo profilo: come ti vedono tutti gli iscritti nella Comunità e sotto le partite
 * (ADR 0064). Nome utente, immagine e stile del nome in un'unica pagina, con l'anteprima.
 */
export default async function AccountPage() {
  const user = await requireUser();
  const m = getMessages();
  const p = m.preferences;
  const a = m.account;
  const community = await getOwnCommunityProfile(user.id);
  const shownName = user.displayName ?? user.email.split("@")[0]!;

  return (
    <>
      <PageHeader title={a.title} description={a.description} />
      <SettingsTabs current="account" />
      <div className="mb-3 flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <UserAvatar style={user.avatarStyle} name={shownName} className="size-14" />
        <div className="min-w-0">
          <p className="truncate text-base">
            <StyledName
              name={shownName}
              color={community.nameColor}
              style={community.nameStyle}
              className="font-semibold"
            />
          </p>
          <p className="text-xs text-muted">{a.publicHint}</p>
        </div>
      </div>

      {/* Riquadri affiancati dal computer: stessa larghezza delle altre pagine. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section id="name" title={a.nameTitle} hint={a.nameHint}>
          <ActionForm action={saveDisplayName} trackChanges>
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
          <ActionForm action={saveAvatarStyle} trackChanges>
            <fieldset>
              <legend className="sr-only">{a.avatarTitle}</legend>
              <div className="flex flex-wrap gap-2">
                {/* Solo immagini, senza scritte sotto: il nome del tipo è per i lettori di
                  schermo e nel suggerimento, così la griglia resta regolare. */}
                {AVATAR_STYLES.map((s) => (
                  <label
                    key={s}
                    title={p.avatarStyles[s]}
                    className="cursor-pointer rounded-xl p-1 ring-2 ring-transparent transition-shadow has-[:checked]:ring-positive has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-positive"
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
          <ActionForm action={saveNameStyle} trackChanges>
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
      </div>
    </>
  );
}
