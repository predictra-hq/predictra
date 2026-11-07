import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, Field, Input } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { acceptInvite } from "./actions";

export const metadata: Metadata = { title: "Attivazione account" };

export default async function AcceptInvitePage() {
  const m = getMessages();
  const user = await requireUser({ allowWithoutRole: true });
  if (user.roles.length > 0) redirect("/dashboard");

  return (
    <Card>
      <h1 className="text-lg font-semibold">{m.auth.acceptTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{m.auth.acceptSubtitle}</p>
      <ActionForm action={acceptInvite}>
        <Field label={m.common.email} htmlFor="email">
          <Input id="email" value={user.email} readOnly disabled />
        </Field>
        <Field label={m.auth.displayName} htmlFor="displayName">
          <Input id="displayName" name="displayName" maxLength={80} autoComplete="name" required />
        </Field>
        <Field label={m.common.password} htmlFor="password" hint={m.auth.passwordRules}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </Field>
        <Field label={m.common.confirmPassword} htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </Field>
        <SubmitButton>{m.auth.acceptButton}</SubmitButton>
      </ActionForm>
    </Card>
  );
}
