import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, Field, Input } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";
import { safeNextPath } from "@/lib/validation";
import { verifyMfa } from "./actions";

export const metadata: Metadata = { title: "Verifica 2FA" };

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const m = getMessages();
  const { next } = await searchParams;
  return (
    <Card>
      <h1 className="text-lg font-semibold">{m.auth.mfaTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{m.auth.mfaSubtitle}</p>
      <ActionForm action={verifyMfa}>
        <input
          type="hidden"
          name="next"
          value={safeNextPath(typeof next === "string" ? next : null)}
        />
        <Field label={m.auth.mfaCode} htmlFor="code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </Field>
        <SubmitButton>{m.auth.mfaButton}</SubmitButton>
      </ActionForm>
      <form action="/auth/signout" method="post" className="mt-3">
        <button type="submit" className="w-full text-center text-sm text-muted hover:text-fg">
          {m.common.signOut}
        </button>
      </form>
    </Card>
  );
}
