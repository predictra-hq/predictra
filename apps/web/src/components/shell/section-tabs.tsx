import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { ADMIN_SECTIONS, type AdminSection } from "./nav-config";

/** Schede interne di una sezione di amministrazione (es. Sistema: Modello, Agente, Dati). */
export function SectionTabs({ section, current }: { section: AdminSection; current: string }) {
  const nav = getMessages().nav;
  return (
    <nav aria-label={nav.administration} className="mb-4 flex flex-wrap gap-2">
      {ADMIN_SECTIONS[section].map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              active
                ? "border-positive/40 bg-positive-soft text-positive-strong"
                : "border-border text-muted hover:text-fg"
            }`}
          >
            {nav[tab.key]}
          </Link>
        );
      })}
    </nav>
  );
}
