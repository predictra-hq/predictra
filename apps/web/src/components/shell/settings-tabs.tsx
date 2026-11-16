import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getMessages } from "@/lib/i18n";
import { SETTINGS_TABS } from "./nav-config";

/** Schede della sezione Impostazioni: nel menu c'è una sola voce, qui si passa da una pagina all'altra. */
export function SettingsTabs({ current }: { current: (typeof SETTINGS_TABS)[number]["key"] }) {
  const nav = getMessages().nav;
  return (
    <nav aria-label={nav.settings} className="mb-4 flex flex-wrap items-center gap-2">
      <Link
        href="/settings"
        className="-ml-1 mr-1 inline-flex items-center gap-0.5 rounded-lg py-1.5 pr-2 text-sm text-muted hover:text-fg"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        {nav.profile}
      </Link>
      {SETTINGS_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            tab.key === current
              ? "border-positive/40 bg-positive-soft text-positive-strong"
              : "border-border text-muted hover:text-fg"
          }`}
        >
          {nav[tab.key]}
        </Link>
      ))}
    </nav>
  );
}
