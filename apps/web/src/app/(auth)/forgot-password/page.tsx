import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, Field, Input } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Recupero password" };

export default function ForgotPasswordPage() {
  const m = getMessages();
  return (
    <Card>
      <h1 className="text-lg font-semibold">{m.auth.forgotTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{m.auth.forgotSubtitle}</p>
      <ActionForm action={requestPasswordReset}>
        <Field label={m.common.email} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton>{m.auth.forgotButton}</SubmitButton>
        <Link href="/login" className="text-center text-sm text-muted hover:text-fg">
          {m.auth.backToLogin}
        </Link>
      </ActionForm>
    </Card>
  );
}
