"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Form di filtro via GET senza ricaricare la pagina: all'invio cambia solo l'indirizzo
 * (`?c=SA&g=12`) e Next.js aggiorna il contenuto dal server, con menu e scroll fermi.
 * Si invia da solo quando cambia una tendina; il pulsante resta per la tastiera. Senza
 * JavaScript funziona come un normale form GET.
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  // Ultima tendina cambiata: decide quali campi azzerare all'invio.
  const changed = useRef<string | null>(null);

  return (
    <form
      // Nuovo indirizzo → form rimontato: i campi mostrano i valori scelti dal server.
      key={searchParams.toString()}
      method="get"
      aria-busy={pending}
      className={cn(className, pending && "opacity-60 transition-opacity")}
      onChange={(e) => {
        const target = e.target;
        if (!(target instanceof HTMLSelectElement)) return;
        changed.current = target.name;
        e.currentTarget.requestSubmit();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        for (const [name, value] of new FormData(e.currentTarget)) {
          if (typeof value === "string") params.append(name, value);
        }
        for (const name of (changed.current && resets?.[changed.current]) || []) {
          params.delete(name);
        }
        changed.current = null;
        const query = params.toString();
        startTransition(() => {
          router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
        });
      }}
    >
      {children}
    </form>
  );
}
