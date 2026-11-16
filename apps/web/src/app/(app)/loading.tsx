import { getMessages } from "@/lib/i18n";

/*
 * Stato di caricamento delle sezioni dell'app. Next.js lo mostra subito, già
 * precaricato dai link del menu, mentre il server prepara la pagina: la navigazione
 * non resta ferma sulla pagina precedente in attesa delle letture dal database.
 * Il layout `(app)` (menu e sessione) è condiviso e resta visibile.
 */
export default function Loading() {
  const m = getMessages();
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{m.common.loading}</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="h-7 w-64 max-w-full rounded-md bg-surface-2" />
        <div className="mt-3 h-4 w-96 max-w-full rounded-md bg-surface-2" />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-[var(--radius-card)] border border-border bg-surface"
            />
          ))}
        </div>
        <div className="mt-6 h-64 rounded-[var(--radius-card)] border border-border bg-surface" />
      </div>
    </div>
  );
}
