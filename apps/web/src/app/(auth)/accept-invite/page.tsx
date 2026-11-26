import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { newPasswordLabels } from "@/components/auth/new-password-labels";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { KeepInput } from "@/components/ui/keep-input";
import { Card, Field, Input } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { acceptInvite } from "./actions";

export const metadata: Metadata = { title: getMessages().pageTitles.acceptInvite };

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
          <KeepInput
            id="displayName"
            name="displayName"
            maxLength={80}
            autoComplete="name"
            required
          />
        </Field>
        <NewPasswordFields labels={newPasswordLabels()} />
        <SubmitButton>{m.auth.acceptButton}</SubmitButton>
      </ActionForm>
    </Card>
  );
}
