import { getMessages } from "@/lib/i18n";
import { Input, Label } from "./primitives";

/**
 * Codice dell'app di autenticazione per le azioni distruttive (step-up, ADR 0077). Facoltativo:
 * entro 5 minuti da un codice già inserito il database accetta l'azione anche senza.
 * Il nome del campo è `STEP_UP_FIELD` di `lib/auth/step-up.ts`.
 */
export function StepUpField({ id, compact = false }: { id: string; compact?: boolean }) {
  const m = getMessages().admin;
  const input = (
    <Input
      id={id}
      name="stepUpCode"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      placeholder="123456"
      aria-describedby={`${id}-hint`}
      className={compact ? "h-8 w-28 text-xs" : "w-40 font-mono tracking-widest"}
    />
  );
  if (compact) {
    return (
      <div className="flex flex-col gap-1">
        <Label htmlFor={id} className="text-xs">
          {m.stepUpLabel}
        </Label>
        {input}
        <p id={`${id}-hint`} className="sr-only">
          {m.stepUpHint}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{m.stepUpLabel}</Label>
      {input}
      <p id={`${id}-hint`} className="text-xs text-muted">
        {m.stepUpHint}
      </p>
    </div>
  );
}
