import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, Field, Input } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";
import { resetPassword } from "./actions";

export const metadata: Metadata = { title: "Nuova password" };

export default function ResetPasswordPage() {
  const m = getMessages();
  return (
    <Card>
      <h1 className="mb-5 text-lg font-semibold">{m.auth.resetTitle}</h1>
      <ActionForm action={resetPassword}>
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
        <SubmitButton>{m.auth.resetButton}</SubmitButton>
      </ActionForm>
    </Card>
  );
}
