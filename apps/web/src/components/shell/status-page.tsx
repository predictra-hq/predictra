import type { ReactNode } from "react";

/** Pagina di stato a tutto riquadro (errore, pagina non trovata). */
export function StatusPage({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="rounded-full border border-border bg-surface p-4 text-muted">{icon}</span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">{description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>
    </div>
  );
}

export const statusLinkClass =
  "inline-flex h-10 items-center justify-center rounded-lg border border-border-strong bg-surface-2 px-4 text-sm font-medium text-fg transition-colors hover:bg-border";
