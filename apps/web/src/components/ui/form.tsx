"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/errors";
import { Alert, Button } from "./primitives";

export function SubmitButton({
  children,
  variant,
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      variant={variant}
      className={className}
    >
      {children}
    </Button>
  );
}

/**
 * Form collegato a una Server Action con stato `{ ok, message }`. Mostra l'esito
 * in un'area live per gli screen reader.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-4"} noValidate>
      {children}
      <div aria-live="polite">
        {state ? <Alert tone={state.ok ? "positive" : "negative"}>{state.message}</Alert> : null}
      </div>
    </form>
  );
}
