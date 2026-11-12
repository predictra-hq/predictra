/**
 * Simbolo di PREDICTRA: una linea di andamento che termina in un pallone.
 * Decorativo: sta sempre accanto al nome scritto. Stesso disegno di `src/app/icon.svg`.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="7" className="fill-surface" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="6.5"
        fill="none"
        className="stroke-border-strong"
      />
      <polyline
        points="6,23 12,16.5 17,20 23.5,11"
        fill="none"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-positive"
      />
      <circle cx="24.5" cy="9.5" r="3.4" className="fill-fg" />
    </svg>
  );
}
