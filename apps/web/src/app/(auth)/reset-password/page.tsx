import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { newPasswordLabels } from "@/components/auth/new-password-labels";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";
import { resetPassword } from "./actions";

export const metadata: Metadata = { title: "Nuova password" };

export default function ResetPasswordPage() {
  const m = getMessages();
  return (
    <Card>
      <h1 className="mb-5 text-lg font-semibold">{m.auth.resetTitle}</h1>
      <ActionForm action={resetPassword}>
        <NewPasswordFields labels={newPasswordLabels()} />
        <SubmitButton>{m.auth.resetButton}</SubmitButton>
      </ActionForm>
    </Card>
  );
}
