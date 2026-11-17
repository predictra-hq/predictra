"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Messages } from "@/lib/i18n";
import { isNavItemActive, sectionOf } from "./nav-config";

/**
 * Telefono: schede in alto con le viste della sezione scelta nella barra in basso
 * (es. Calcio → Partite, Campionati). Sono le stesse voci del menu laterale, che su
 * schermi larghi è sempre visibile: lì le schede non servono.
 */
export function SectionNav({ messages }: { messages: Messages }) {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  if (!section) return null;
  return (
    <nav aria-label={messages.nav.sectionViews} className="tab-strip tab-strip-mobile">
      {section.items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={isNavItemActive(item, pathname) ? "page" : undefined}
        >
          {messages.nav[item.key]}
        </Link>
      ))}
    </nav>
  );
}
