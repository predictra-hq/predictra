"use client";

import { useActionState, useEffect, useRef } from "react";
import { SendHorizontal } from "lucide-react";
import { COMMENT_MAX_LENGTH } from "@predictra/shared-types";
import type { ActionState } from "@/lib/errors";
import { playSound } from "@/lib/sounds";

/**
 * Campo per scrivere in fondo alla chat (ADR 0065): Invio manda, Maiusc+Invio va a capo.
 * Dopo l'invio il campo si svuota; un errore compare sopra il campo.
 */
export function ChatComposer({
  action,
  hidden,
  placeholder,
  sendLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Campi nascosti, es. il canale. */
  hidden: Record<string, string>;
  placeholder: string;
  sendLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result) playSound(result.ok ? "success" : "error");
      return result;
    },
    null,
  );
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
      {state && !state.ok ? (
        <p role="alert" className="px-1 text-xs text-negative-strong">
          {state.message}
        </p>
      ) : null}
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="chat-body">
          {placeholder}
        </label>
        <textarea
          id="chat-body"
          name="body"
          required
          rows={1}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-input bg-bg px-4 py-2.5 text-base text-fg placeholder:text-subtle focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30 sm:text-sm [field-sizing:content]"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label={sendLabel}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-positive text-on-positive transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
