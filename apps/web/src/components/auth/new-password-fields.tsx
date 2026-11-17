"use client";

import { useState } from "react";
import { Check, Circle } from "lucide-react";
import { Field, Input } from "@/components/ui/primitives";
import { passwordChecks, PASSWORD_MIN_LENGTH, type PasswordCheck } from "@/lib/password";
import { cn } from "@/lib/utils";

export interface NewPasswordLabels {
  password: string;
  confirm: string;
  checks: Record<PasswordCheck, string>;
}

/**
 * Nuova password e conferma, con i requisiti che si spuntano mentre si scrive. I campi
 * sono controllati: se il server risponde con un errore restano compilati.
 */
export function NewPasswordFields({ labels }: { labels: NewPasswordLabels }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const checks = passwordChecks(password, confirm);
  const shown: PasswordCheck[] = confirm
    ? ["length", "letter", "digit", "match"]
    : ["length", "letter", "digit"];
  return (
    <>
      <Field label={labels.password} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-checks"
        />
      </Field>
      <ul id="password-checks" className="-mt-2 flex flex-col gap-1 text-xs">
        {shown.map((key) => (
          <li
            key={key}
            className={cn(
              "flex items-center gap-1.5",
              checks[key] ? "text-positive-strong" : "text-muted",
            )}
          >
            {checks[key] ? (
              <Check size={14} aria-hidden="true" className="shrink-0" />
            ) : (
              <Circle size={14} aria-hidden="true" className="shrink-0" />
            )}
            {labels.checks[key]}
          </li>
        ))}
      </ul>
      <Field label={labels.confirm} htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
    </>
  );
}
