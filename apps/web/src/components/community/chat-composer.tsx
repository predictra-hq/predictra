"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { COMMENT_MAX_LENGTH } from "@predictra/shared-types";
import type { ActionState } from "@/lib/errors";
import { playSound } from "@/lib/sounds";

/**
 * Campo per scrivere in fondo alla chat (ADR 0065): Invio manda, Maiusc+Invio va a capo.
 * Dopo l'invio il campo si svuota; un errore compare sopra il campo e sparisce appena si
 * riscrive. Durante l'attesa tra due messaggi (ADR 0071) il pulsante resta spento e il tempo
 * che manca si vede sopra il campo; i lettori di schermo lo sentono una volta sola.
 */
export function ChatComposer({
  action,
  hidden,
  placeholder,
  sendLabel,
  cooldownLeft,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Campi nascosti, es. il canale. */
  hidden: Record<string, string>;
  placeholder: string;
  sendLabel: string;
  /** "Puoi scrivere di nuovo tra {time}." */
  cooldownLeft: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // Niente invio a vuoto: il pulsante si accende solo con del testo.
  const [empty, setEmpty] = useState(true);
  const [dismissed, setDismissed] = useState<ActionState>(null);
  const [now, setNow] = useState(() => Date.now());
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      setNow(Date.now());
      if (result) playSound(result.ok ? "success" : "error");
      if (result?.ok) {
        formRef.current?.reset();
        setEmpty(true);
      }
      return result;
    },
    null,
  );
  const retryAt = state && !state.ok && state.retryAt ? Date.parse(state.retryAt) : null;
  const waiting = retryAt !== null && retryAt > now;
  useEffect(() => {
    if (retryAt === null) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const left = retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  // Errore da mostrare: l'attesa finché dura, gli altri finché non si riscrive.
  const showError =
    state && !state.ok && (retryAt !== null ? waiting : state !== dismissed) ? state : null;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
      {showError ? (
        <p role="alert" className="px-1 text-xs text-negative-strong">
          {showError.message}
          {waiting ? (
            <>
              {" "}
              <span aria-hidden="true" className="font-mono tabular-nums">
                {cooldownLeft.replace("{time}", clock)}
              </span>
            </>
          ) : null}
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
          onInput={(e) => {
            setEmpty(e.currentTarget.value.trim() === "");
            setDismissed(state);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (e.currentTarget.value.trim() && !waiting) e.currentTarget.form?.requestSubmit();
            }
          }}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-input bg-bg px-4 py-2.5 text-base text-fg placeholder:text-subtle focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30 sm:text-sm [field-sizing:content]"
        />
        <button
          type="submit"
          disabled={pending || empty || waiting}
          aria-label={sendLabel}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-positive text-on-positive transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
