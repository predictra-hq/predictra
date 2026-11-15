"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV, isNavItemActive } from "./nav-config";
import { NAV_ICONS } from "./sidebar";

/**
 * Barra in basso sul telefono: le pagine di tutti i giorni a un tocco, senza aprire il
 * menu. Su schermi larghi c'è la barra laterale e questa non compare.
 */
export function BottomNav({ messages }: { messages: Messages }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={messages.nav.quickNav}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {BOTTOM_NAV.map((item) => {
          const Icon = NAV_ICONS[item.key];
          const active = isNavItemActive(item, pathname);
          return (
            <li key={item.key} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px]",
                  active ? "font-medium text-positive-strong" : "text-muted hover:text-fg",
                )}
              >
                {Icon ? <Icon size={20} aria-hidden="true" /> : null}
                <span className="max-w-full truncate">{messages.nav[item.key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
