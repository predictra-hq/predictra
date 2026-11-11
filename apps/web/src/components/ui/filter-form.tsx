"use client";

import type { ReactNode } from "react";

/**
 * Form di filtro via GET che si invia da solo quando cambia una tendina: non serve
 * premere il pulsante. Il pulsante resta per chi usa la tastiera o non ha JavaScript.
 *
 * `resets` azzera altri campi quando ne cambia uno: ad esempio cambiando competizione
 * la giornata scelta non ha più senso (`{ c: ["g"] }`).
 */
export function FilterForm({
  children,
  className,
  resets,
}: {
  children: ReactNode;
  className?: string;
  resets?: Record<string, readonly string[]>;
}) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        const target = e.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const form = e.currentTarget;
        for (const name of resets?.[target.name] ?? []) {
          const field = form.elements.namedItem(name);
          // Un campo disabilitato non viene inviato: il server usa il valore predefinito.
          if (field instanceof HTMLSelectElement || field instanceof HTMLInputElement) {
            field.disabled = true;
          }
        }
        form.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
