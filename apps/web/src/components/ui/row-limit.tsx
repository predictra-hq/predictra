"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Tabella con un limite di righe visibili: oltre `limit` le righe restano nascoste (CSS in
 * globals.css, `[data-row-limit]`) finché non si preme "Mostra altre". Così nessuna
 * tabella diventa infinita, né da computer né da telefono. I testi arrivano dal server.
 */
export function RowLimitClient({
  total,
  limit,
  more,
  less,
  children,
}: {
  total: number;
  limit: 5 | 10;
  /** "Mostra altre {count}" */
  more: string;
  less: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (total <= limit) return <>{children}</>;
  return (
    <div data-row-limit={limit} data-open={open ? "" : undefined}>
      {children}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-border px-4 py-2.5 text-sm font-medium text-positive-strong hover:bg-surface-2"
      >
        {open ? (
          <ChevronUp size={16} aria-hidden="true" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
        {open ? less : more.replace("{count}", String(total - limit))}
      </button>
    </div>
  );
}
