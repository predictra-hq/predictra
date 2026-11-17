import { getMessages } from "@/lib/i18n";
import type { NewPasswordLabels } from "./new-password-fields";

/** Testi del blocco password, preparati sul server. */
export function newPasswordLabels(): NewPasswordLabels {
  const m = getMessages();
  return {
    password: m.common.password,
    confirm: m.common.confirmPassword,
    checks: m.auth.passwordChecks,
  };
}
