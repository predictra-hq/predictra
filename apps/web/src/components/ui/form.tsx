"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/errors";
import { playSound } from "@/lib/sounds";
import { Modal } from "./modal";
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
  resultDialog,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  /** Esito in una finestra modale invece che sotto il modulo: titolo e testo di chiusura. */
  resultDialog?: { title: string; close: string };
}) {
  // Esito con un suono breve (se acceso nelle Preferenze): salita se fatto, discesa se errore.
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result) playSound(result.ok ? "success" : "error");
    return result;
  }, null);
  // Ogni nuovo esito riapre la modale; chiuderla segna quell'esito come già visto.
  const [seen, setSeen] = useState<ActionState>(null);
  const result = state ? (
    <>
      <Alert tone={state.ok ? "positive" : "negative"}>{state.message}</Alert>
      {state.link ? <OneTimeLink url={state.link} /> : null}
    </>
  ) : null;
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-4"} noValidate>
      {children}
      {resultDialog ? (
        <Modal
          open={state !== null && state !== seen}
          onClose={() => setSeen(state)}
          title={resultDialog.title}
          closeLabel={resultDialog.close}
        >
          <div aria-live="polite" className="flex flex-col gap-3">
            {result}
            <Button
              type="button"
              variant="secondary"
              className="self-end"
              onClick={() => setSeen(state)}
            >
              {resultDialog.close}
            </Button>
          </div>
        </Modal>
      ) : (
        <div aria-live="polite" className="sm:col-span-full">
          {result}
        </div>
      )}
    </form>
  );
}
