import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { KeepInput } from "@/components/ui/keep-input";
import { Alert, Card, Field, Input } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";
import { login } from "./actions";

export const metadata: Metadata = { title: "Accesso" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const m = getMessages();
  const { error } = await searchParams;
  return (
    <Card>
      <h1 className="text-lg font-semibold">{m.auth.loginTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{m.auth.loginSubtitle}</p>
      {error === "link" ? (
        <Alert tone="negative" className="mb-4">
          {m.auth.linkInvalid}
        </Alert>
      ) : null}
      <ActionForm action={login}>
        <Field label={m.common.email} htmlFor="email">
          <KeepInput id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={m.common.password} htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <SubmitButton>{m.auth.loginButton}</SubmitButton>
        <Link href="/forgot-password" className="text-center text-sm text-muted hover:text-fg">
          {m.auth.forgotPassword}
        </Link>
        <Link href="/" className="text-center text-sm text-muted hover:text-fg">
          {m.landing.about}
        </Link>
      </ActionForm>
    </Card>
  );
}
