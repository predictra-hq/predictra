import Link from "next/link";
import { SECTION_TABS, type SectionGroup } from "@/components/shell/nav-config";
import { getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Schede in cima alle pagine di una stessa sezione (es. Campionati, Statistiche, Quote):
 * il menu ha una sola voce per sezione e da qui si passa da una pagina all'altra.
 */
export function SectionTabs({ group, current }: { group: SectionGroup; current: string }) {
  const m = getMessages();
  return (
    <nav aria-label={m.common.sectionTabs[group]} className="mb-5 flex flex-wrap gap-2">
      {SECTION_TABS[group].map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === current ? "page" : undefined}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm",
            tab.href === current
              ? "border-positive/40 bg-positive-soft text-positive-strong"
              : "border-border text-muted hover:text-fg",
          )}
        >
          {m.nav[tab.key]}
        </Link>
      ))}
    </nav>
  );
}
