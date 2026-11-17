"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/errors";
import { OneTimeLink, SubmitButton } from "./form";
import { Modal } from "./modal";
import { Alert, Button } from "./primitives";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export interface ActionDialogLabels {
  cancel: string;
  close: string;
}

function DialogForm({
  action,
  fields,
  description,
  confirm,
  confirmVariant,
  labels,
  onClose,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  description?: ReactNode;
  confirm: string;
  confirmVariant: Variant;
  labels: ActionDialogLabels;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  if (state) {
    return (
      <div className="flex flex-col gap-3" aria-live="polite">
        <Alert tone={state.ok ? "positive" : "negative"}>{state.message}</Alert>
        {state.link ? <OneTimeLink url={state.link} /> : null}
        <Button type="button" variant="secondary" className="self-end" onClick={onClose}>
          {labels.close}
        </Button>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {description ? <div className="text-sm text-muted">{description}</div> : null}
      {children}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {labels.cancel}
        </Button>
        <SubmitButton variant={confirmVariant}>{confirm}</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Bottone che apre una modale di conferma con il modulo della Server Action. L'esito
 * (messaggio e, se c'è, il link monouso) compare nella modale, non nella pagina.
 */
export function ActionDialog({
  trigger,
  triggerVariant = "secondary",
  triggerClassName = "h-8 px-3 text-xs",
  title,
  description,
  confirm,
  confirmVariant = "primary",
  action,
  fields,
  labels,
  children,
}: {
  trigger: string;
  triggerVariant?: Variant;
  triggerClassName?: string;
  title: string;
  description?: ReactNode;
  confirm: string;
  confirmVariant?: Variant;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  labels: ActionDialogLabels;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Ogni apertura riparte da zero (modulo nuovo, nessun esito precedente).
  const [round, setRound] = useState(0);
  const close = () => setOpen(false);
  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        className={triggerClassName}
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        {trigger}
      </Button>
      <Modal open={open} onClose={close} title={title} closeLabel={labels.close}>
        {open ? (
          <DialogForm
            key={round}
            action={action}
            fields={fields}
            description={description}
            confirm={confirm}
            confirmVariant={confirmVariant}
            labels={labels}
            onClose={close}
          >
            {children}
          </DialogForm>
        ) : null}
      </Modal>
    </>
  );
}
