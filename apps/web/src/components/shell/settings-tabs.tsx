import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { SETTINGS_TABS } from "./nav-config";

/** Schede della sezione Impostazioni: nel menu c'è una sola voce, qui si passa da una pagina all'altra. */
export function SettingsTabs({ current }: { current: (typeof SETTINGS_TABS)[number]["key"] }) {
  const nav = getMessages().nav;
  return (
    <nav aria-label={nav.settings} className="mb-4 flex flex-wrap gap-2">
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
