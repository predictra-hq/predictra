"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { playSound, setSoundsEnabled } from "@/lib/sounds";
import { saveAccountSettings } from "@/app/(app)/account-settings-action";

/**
 * Interruttore dei suoni in _Preferenze_: vale per questo dispositivo. Accendendoli si sente
 * subito un esempio (e su iPhone il tocco sblocca l'audio per la pagina).
 */
export function SoundToggle({
  initial,
  labels,
}: {
  initial: boolean;
  labels: { on: string; off: string };
}) {
  const [enabled, setEnabled] = useState(initial);
  return (
    <div className="flex flex-wrap gap-2">
      {([true, false] as const).map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={enabled === value}
          onClick={() => {
            setSoundsEnabled(value);
            setEnabled(value);
            void saveAccountSettings({ sounds: value });
            if (value) playSound("success", { force: true });
          }}
          className={cn(
            "cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors",
            enabled === value
              ? "border-positive/40 bg-positive-soft text-positive-strong"
              : "border-border text-muted hover:text-fg",
          )}
        >
          {value ? labels.on : labels.off}
        </button>
      ))}
    </div>
  );
}
