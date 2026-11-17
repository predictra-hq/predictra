import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getMessages } from "@/lib/i18n";
import { SETTINGS_TABS } from "./nav-config";

/** Schede della sezione Impostazioni: nel menu c'è una sola voce, qui si passa da una pagina all'altra. */
export function SettingsTabs({ current }: { current: (typeof SETTINGS_TABS)[number]["key"] }) {
  const nav = getMessages().nav;
  return (
    <nav aria-label={nav.settings} className="tab-strip">
      <Link href="/settings">
        <ChevronLeft size={16} aria-hidden="true" />
        {nav.profile}
      </Link>
      {SETTINGS_TABS.map((tab) => (
        <Link key={tab.key} href={tab.href} aria-current={tab.key === current ? "page" : undefined}>
          {nav[tab.key]}
        </Link>
      ))}
    </nav>
  );
}
