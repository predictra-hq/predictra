"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV, isNavItemActive } from "./nav-config";
import { NAV_ICONS } from "./sidebar";

/** Contenuto di una voce: pulsa finché la pagina toccata non arriva, così il tocco si vede subito. */
function TabContent({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        "flex min-w-0 max-w-full flex-col items-center gap-0.5",
        pending && "text-fg motion-safe:animate-pulse",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Barra in basso sul telefono: le pagine di tutti i giorni a un tocco, senza aprire il
 * menu. Su schermi larghi c'è la barra laterale e questa non compare.
 */
export function BottomNav({ messages }: { messages: Messages }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={messages.nav.quickNav}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),0.375rem)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
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
                  "flex h-16 flex-col items-center justify-center px-0.5 text-[0.8125rem] leading-tight transition-colors",
                  active ? "font-semibold text-positive-strong" : "text-muted hover:text-fg",
                )}
              >
                <TabContent>
                  {Icon ? (
                    <span
                      className={cn(
                        "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                        active && "bg-positive-soft",
                      )}
                    >
                      <Icon size={22} aria-hidden="true" />
                    </span>
                  ) : null}
                  <span className="max-w-full truncate">{messages.nav[item.key]}</span>
                </TabContent>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
