"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Tavolozza delle emoji (ADR 0070) su `<details>`: funziona anche senza JavaScript, e con
 * JavaScript si chiude con Esc (il focus torna al pulsante), con un tocco fuori e dopo aver
 * scelto un'emoji.
 */
export function ReactionPicker({
  summary,
  summaryLabel,
  children,
  className,
}: {
  summary: ReactNode;
  summaryLabel: string;
  /** I moduli delle emoji. */
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const close = (focus: boolean) => {
      if (!details.open) return;
      details.open = false;
      if (focus) details.querySelector("summary")?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !details.contains(e.target)) close(false);
    };
    const onSubmit = () => close(true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    details.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      details.removeEventListener("submit", onSubmit);
    };
  }, []);

  return (
    <details ref={ref} className="group relative">
      <summary
        aria-label={summaryLabel}
        className="flex min-h-9 min-w-9 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-surface px-2 text-xs text-muted hover:text-fg [&::-webkit-details-marker]:hidden"
      >
        {summary}
      </summary>
      <div role="group" aria-label={summaryLabel} className={className}>
        {children}
      </div>
    </details>
  );
}
