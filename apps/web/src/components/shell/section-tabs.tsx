import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { ADMIN_SECTIONS, type AdminSection } from "./nav-config";

/** Schede interne di una sezione di amministrazione (es. Sistema: Modello, Agente, Dati). */
export function SectionTabs({ section, current }: { section: AdminSection; current: string }) {
  const nav = getMessages().nav;
  return (
    <nav aria-label={nav.administration} className="tab-strip">
      {ADMIN_SECTIONS[section].map((tab) => {
        const active = tab.href === current;
        return (
          <Link key={tab.key} href={tab.href} aria-current={active ? "page" : undefined}>
            {nav[tab.key]}
          </Link>
        );
      })}
    </nav>
  );
}
