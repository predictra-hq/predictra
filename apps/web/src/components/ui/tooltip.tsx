import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Suggerimento con la grafica del sito, al posto di quello del browser (`title`): compare
 * passando con il mouse o arrivando con la tastiera (focus). Solo CSS, quindi funziona anche
 * nei componenti server e senza JavaScript.
 *
 * Il testo resta nella pagina (trasparente finché non serve), così lo leggono anche i
 * lettori di schermo.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  if (label === null || label === undefined || label === "") return <>{children}</>;
  return (
    <span className={cn("group/tip relative inline-flex max-w-full", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-64 rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-fg opacity-0 shadow-lg transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
        )}
      >
        {label}
      </span>
    </span>
  );
}
