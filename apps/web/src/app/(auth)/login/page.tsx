import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { KeepInput } from "@/components/ui/keep-input";
import { Alert, Card, Field } from "@/components/ui/primitives";
import { LoginPassword } from "./login-password";
import { getMessages } from "@/lib/i18n";
import { login } from "./actions";

export const metadata: Metadata = { title: getMessages().pageTitles.login };

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
        {/* Dal lavoro di Alfredo (branch accesso-presentazione): recupero accanto alla
            password e pulsante per mostrarla; grafica invariata. */}
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
            <label htmlFor="password" className="font-medium">
              {m.common.password}
            </label>
            <Link
              href="/forgot-password"
              className="text-muted underline underline-offset-4 hover:text-fg"
            >
              {m.auth.forgotPassword}
            </Link>
          </div>
          <LoginPassword show={m.auth.showPassword} hide={m.auth.hidePassword} />
        </div>
        <SubmitButton>{m.auth.loginButton}</SubmitButton>
        <Link href="/" className="text-center text-sm text-muted hover:text-fg">
          {m.auth.backToPresentation}
        </Link>
      </ActionForm>
    </Card>
  );
}
