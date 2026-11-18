"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GraduationCap } from "lucide-react";
import type { Messages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { completeTour } from "@/app/(app)/tour-action";
import { playSound } from "@/lib/sounds";
import { cardTop, TOUR_COOKIE, TOUR_RESTART_EVENT, TOUR_STEPS, type Rect } from "@/lib/tour";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Primo elemento visibile sullo schermo tra quelli indicati dal passo. */
function findTarget(selector: string | null): Element | null {
  if (!selector) return null;
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

function markDone(): void {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${TOUR_COOKIE}=done; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}

/**
 * Tutorial interattivo della prima entrata. Parte da solo una sola volta per utente: `done`
 * viene dal profilo (`user_dashboard_settings`) o, per non leggerlo ogni volta, dal cookie; si riapre dal Profilo. Evidenzia una zona alla volta e la
 * spiega in una scheda; Esc o «Salta» lo chiudono.
 */
export function Tour({ messages, done }: { messages: Messages["tour"]; done: boolean }) {
  const [step, setStep] = useState<number | null>(done ? null : 0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const restart = () => setStep(0);
    window.addEventListener(TOUR_RESTART_EVENT, restart);
    return () => window.removeEventListener(TOUR_RESTART_EVENT, restart);
  }, []);

  const close = useCallback(() => {
    markDone();
    setStep(null);
    // Anche nel profilo: un nuovo accesso o un altro dispositivo non lo ripropongono.
    void completeTour().catch(() => {});
  }, []);

  // Misura la zona da evidenziare; si aggiorna se lo schermo cambia (rotazione, scorrimento).
  useLayoutEffect(() => {
    if (step === null) return;
    const target = findTarget(TOUR_STEPS[step]!.selector);
    target?.scrollIntoView({ block: "nearest" });
    const measure = () => {
      if (!target) return setRect(null);
      const r = target.getBoundingClientRect();
      setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    primaryRef.current?.focus();
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    setTop(card && rect ? cardTop(rect, card.offsetHeight, window.innerHeight) : null);
  }, [rect, step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, close]);

  if (step === null) return null;
  const current = TOUR_STEPS[step]!;
  const text = messages.steps[current.id];
  const last = step === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl ring-2 ring-positive transition-all duration-200"
          style={{ ...rect, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)" }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-black/60" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        className="fixed left-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-fg shadow-xl"
        style={top === null ? { top: "50%", translate: "-50% -50%" } : { top }}
      >
        <p className="text-xs text-subtle">
          {fillTemplate(messages.stepOf, { n: step + 1, total: TOUR_STEPS.length })}
        </p>
        <h2 id="tour-title" className="mt-1 text-base font-semibold">
          {text.title}
        </h2>
        <p id="tour-text" className="mt-1 text-sm text-muted">
          {text.text}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={close}
            className="cursor-pointer rounded-lg px-2 py-1.5 text-sm text-muted hover:text-fg"
          >
            {messages.skip}
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                {messages.back}
              </button>
            ) : null}
            <button
              ref={primaryRef}
              type="button"
              onClick={() => {
                if (last) {
                  playSound("complete");
                  close();
                } else {
                  playSound("tap");
                  setStep(step + 1);
                }
              }}
              className="cursor-pointer rounded-lg bg-positive px-3 py-1.5 text-sm font-medium text-on-positive hover:bg-positive-strong"
            >
              {last ? messages.done : messages.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Voce del Profilo (gruppo dell'app): riapre il tutorial dall'inizio. */
export function TourRestartRow({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_RESTART_EVENT))}
      className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-2 active:bg-surface-2"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-positive-soft text-positive-strong">
        <GraduationCap size={15} aria-hidden="true" />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
