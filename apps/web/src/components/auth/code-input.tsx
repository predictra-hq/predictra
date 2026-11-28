"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ClipboardPaste } from "lucide-react";
import { CODE_LENGTH, codeFromText, fillDigits } from "@/lib/code-digits";

const noSubscribe = () => () => {};

export interface CodeInputLabels {
  /** "Cifra {n} di 6" */
  digit: string;
  paste: string;
  /** "Negli appunti non c'è un codice a 6 cifre." */
  pasteEmpty: string;
}

/**
 * Codice della 2FA in 6 caselle, come nelle app. Si può scrivere una cifra alla volta,
 * incollare il codice in qualunque casella o, su telefono e tablet, usare il bottone
 * "Incolla codice" (sul computer non compare: si usa Ctrl+V). La prima casella ha
 * `autoComplete="one-time-code"`: su iPhone e Android la tastiera propone il codice dagli
 * appunti o dal portachiavi. Con 6 cifre il modulo parte da solo
 * (`autoSubmit`), oppure avvisa chi lo usa (`onChange`).
 */
export function CodeInput({
  id,
  name,
  labels,
  autoSubmit = false,
  autoFocus = false,
  onChange,
}: {
  /** Id della prima casella: la collega all'etichetta del campo. */
  id: string;
  /** Nome del campo nascosto inviato con il modulo. */
  name?: string;
  labels: CodeInputLabels;
  autoSubmit?: boolean;
  autoFocus?: boolean;
  onChange?: (code: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  // Il bottone "Incolla" solo dove il browser sa leggere gli appunti (dopo l'idratazione).
  const canPaste = useSyncExternalStore(
    noSubscribe,
    () => !!navigator.clipboard?.readText,
    () => false,
  );
  const [pasteEmpty, setPasteEmpty] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const submitted = useRef("");
  const code = digits.join("");

  useEffect(() => {
    onChange?.(code);
    if (code.length < CODE_LENGTH) {
      submitted.current = "";
      return;
    }
    if (autoSubmit && submitted.current !== code) {
      submitted.current = code;
      boxes.current[0]?.form?.requestSubmit();
    }
  }, [code, autoSubmit, onChange]);

  function apply(next: string[], focusFrom: number) {
    setDigits(next);
    setPasteEmpty(false);
    const firstEmpty = next.findIndex((d) => !d);
    const target = firstEmpty === -1 ? CODE_LENGTH - 1 : Math.max(firstEmpty, focusFrom);
    boxes.current[Math.min(target, CODE_LENGTH - 1)]?.focus();
  }

  async function pasteFromClipboard() {
    try {
      const found = codeFromText(await navigator.clipboard.readText());
      if (found) apply(fillDigits(digits, 0, found), CODE_LENGTH - 1);
      else setPasteEmpty(true);
    } catch {
      setPasteEmpty(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={code} />
      <div className="flex gap-2">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            id={i === 0 ? id : `${id}-${i + 1}`}
            aria-label={labels.digit.replace("{n}", String(i + 1))}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={autoFocus && i === 0}
            value={digit}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const typed = e.currentTarget.value;
              // Una cifra già presente sostituita: si tiene l'ultima scritta.
              const text = typed.length === 2 && digit ? typed.replace(digit, "") || typed : typed;
              const next = fillDigits(digits, i, text);
              apply(next, text ? i + 1 : i);
            }}
            onPaste={(e) => {
              const found = codeFromText(e.clipboardData.getData("text"));
              if (!found) return;
              e.preventDefault();
              apply(fillDigits(digits, 0, found), CODE_LENGTH - 1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digit && i > 0) {
                e.preventDefault();
                const next = [...digits];
                next[i - 1] = "";
                setDigits(next);
                boxes.current[i - 1]?.focus();
              } else if (e.key === "ArrowLeft" && i > 0) {
                e.preventDefault();
                boxes.current[i - 1]?.focus();
              } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
                e.preventDefault();
                boxes.current[i + 1]?.focus();
              }
            }}
            className="h-12 w-11 min-w-0 flex-1 rounded-xl border border-input bg-bg text-center font-mono text-xl font-semibold text-fg transition-colors focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30 sm:h-14 sm:w-12 sm:flex-none"
          />
        ))}
      </div>
      {canPaste ? (
        <button
          type="button"
          onClick={pasteFromClipboard}
          // Solo su telefoni e tablet (puntatore a tocco): sul computer si incolla con Ctrl+V
          // in una casella, il bottone era solo un ingombro.
          className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-lg py-1 text-sm text-positive-strong hover:underline pointer-fine:hidden"
        >
          <ClipboardPaste size={16} aria-hidden="true" />
          {labels.paste}
        </button>
      ) : null}
      <p aria-live="polite" className="text-xs text-muted">
        {pasteEmpty ? labels.pasteEmpty : ""}
      </p>
    </div>
  );
}
