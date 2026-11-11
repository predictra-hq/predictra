"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/errors";
import { Alert, Button, Spinner } from "./primitives";

/**
 * Pulsante di invio: durante l'attesa mostra un indicatore e blocca i doppi clic.
 * Con `confirmMessage` chiede conferma prima di inviare (azioni distruttive).
 */
export function SubmitButton({
  children,
  variant,
  className,
  confirmMessage,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      variant={variant}
      className={className}
      onClick={
        confirmMessage
          ? (e) => {
              if (!window.confirm(confirmMessage)) e.preventDefault();
            }
          : undefined
      }
    >
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}

/** Mostra un link monouso da copiare e consegnare a mano. */
export function OneTimeLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-left">
      <p className="text-xs text-warning">
        Link personale e monouso: consegnalo solo al destinatario con un canale sicuro. Non verrà
        mostrato di nuovo.
      </p>
      <code className="block break-all rounded-md bg-bg px-2 py-1 font-mono text-xs text-fg">
        {url}
      </code>
      <Button
        type="button"
        variant="secondary"
        className="h-8 self-start px-3 text-xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copiato" : "Copia link"}
      </Button>
    </div>
  );
}

/**
 * Form collegato a una Server Action con stato `{ ok, message, link? }`. Mostra
 * l'esito in un'area live per gli screen reader.
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
      <div aria-live="polite" className="sm:col-span-full">
        {state ? <Alert tone={state.ok ? "positive" : "negative"}>{state.message}</Alert> : null}
        {state?.link ? <OneTimeLink url={state.link} /> : null}
      </div>
    </form>
  );
}
