import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { newPasswordLabels } from "@/components/auth/new-password-labels";
import type { Metadata } from "next";
import { hasPermission } from "@predictra/shared-types";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { changePassword, removeTotp, signOutOtherSessions } from "./actions";
import { TotpEnrollment } from "./totp-enrollment";

export const metadata: Metadata = { title: "Sicurezza" };

export default async function SecurityPage({ searchParams }: PageProps<"/settings/security">) {
  const m = getMessages();
  const user = await requireUser();
  const { mfa } = await searchParams;
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  const isAdmin = hasPermission(user.roles, "users.read");

  return (
    <>
      <PageHeader title={m.security.title} />
      <SettingsTabs current="security" />
      {mfa === "required" || (isAdmin && !user.hasMfa) ? (
        <Alert tone="warning" className="mb-6">
          {m.security.mfaRequiredForAdmin}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{m.security.mfaSection}</CardTitle>
            <Badge tone={totp ? "positive" : "warning"}>
              {totp ? m.security.mfaActive : m.security.mfaInactive}
            </Badge>
          </div>
          <p className="mb-4 mt-1 text-sm text-muted">{m.security.mfaDescription}</p>
          {totp ? (
            <ActionForm action={removeTotp} className="flex flex-col gap-3 sm:max-w-xs">
              <input type="hidden" name="factorId" value={totp.id} />
              <SubmitButton variant="danger">{m.security.mfaRemove}</SubmitButton>
            </ActionForm>
          ) : (
            <TotpEnrollment messages={m} />
          )}
        </Card>

        <Card>
          <CardTitle>{m.security.passwordSection}</CardTitle>
          <ActionForm action={changePassword} className="mt-4 flex flex-col gap-4 sm:max-w-sm">
            <NewPasswordFields labels={newPasswordLabels()} />
            <SubmitButton variant="secondary">{m.auth.resetButton}</SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>{m.security.sessionsSection}</CardTitle>
          <p className="mb-4 mt-1 text-sm text-muted">{m.security.sessionsDescription}</p>
          <ActionForm action={signOutOtherSessions} className="flex flex-col gap-3 sm:max-w-xs">
            <SubmitButton variant="secondary">{m.security.signOutOthers}</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
