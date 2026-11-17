import type { ReactNode } from "react";
import { getMessages } from "@/lib/i18n";

/*
 * Segnaposto di caricamento con la stessa forma della pagina che sta arrivando: il
 * contenuto compare al posto giusto invece di "saltare" da uno scheletro generico.
 */
function Shell({ children }: { children: ReactNode }) {
  const m = getMessages();
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{m.common.loading}</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="h-7 w-56 max-w-full rounded-md bg-surface-2" />
        <div className="mt-3 h-4 w-96 max-w-full rounded-md bg-surface-2" />
        {children}
      </div>
    </div>
  );
}

/** Pagine a elenco o tabella: filtri in alto, poi righe. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Shell>
      <div className="mt-8 flex flex-wrap gap-3">
        <div className="h-10 w-48 rounded-lg bg-surface-2" />
        <div className="h-10 w-32 rounded-lg bg-surface-2" />
      </div>
      <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0"
          >
            <div className="h-4 w-20 rounded bg-surface-2" />
            <div className="h-4 flex-1 rounded bg-surface-2" />
            <div className="h-4 w-12 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Pagine a schede: un riquadro largo e una griglia di schede. */
export function CardsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <Shell>
      <div className="mt-8 h-28 rounded-[var(--radius-card)] border border-border bg-surface" />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <div
            key={i}
            className="h-56 rounded-[var(--radius-card)] border border-border bg-surface"
          />
        ))}
      </div>
    </Shell>
  );
}
