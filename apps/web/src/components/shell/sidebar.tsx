"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  CalendarDays,
  Database,
  Layers,
  LayoutDashboard,
  LineChart,
  ListChecks,
  LogOut,
  Mail,
  Menu,
  MessageCircleQuestion,
  ScrollText,
  Settings2,
  ShieldCheck,
  Tags,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-config";

/** Un'icona per voce: il menu si riconosce a colpo d'occhio, non solo leggendo. */
const NAV_ICONS: Partial<Record<NavItem["key"], LucideIcon>> = {
  dashboard: LayoutDashboard,
  matchCenter: CalendarDays,
  statisticsCenter: BarChart3,
  betBuilder: Layers,
  marketIntelligence: TrendingUp,
  leagueIntelligence: Trophy,
  bankroll: Wallet,
  tracker: ListChecks,
  modelIntelligence: LineChart,
  dataCenter: Database,
  askPredictra: MessageCircleQuestion,
  users: Users,
  invitations: Mail,
  audit: ScrollText,
  teamAliases: Tags,
  agent: Bot,
  security: ShieldCheck,
  preferences: Settings2,
};

interface SidebarProps {
  messages: Messages;
  main: readonly NavItem[];
  admin: readonly NavItem[];
  settings: readonly NavItem[];
  userLabel: string;
  roleLabel: string;
}

function NavLinks({
  items,
  messages,
  onNavigate,
}: {
  items: readonly NavItem[];
  messages: Messages;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const label = messages.nav[item.key];
        const Icon = NAV_ICONS[item.key];
        const icon = Icon ? <Icon size={16} aria-hidden="true" className="shrink-0" /> : null;
        if (item.milestone) {
          return (
            <li key={item.key}>
              <span
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-subtle"
                aria-disabled="true"
                title={`${messages.common.availableFrom} Milestone ${item.milestone}`}
              >
                {icon}
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="text-[10px] uppercase tracking-wide">M{item.milestone}</span>
              </span>
            </li>
          );
        }
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-positive-soft font-medium text-positive-strong"
                  : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {icon}
              <span className="min-w-0 truncate">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({ messages, main, admin, settings, userLabel, roleLabel }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Esc chiude il menu su mobile.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // A menu aperto su mobile la pagina sotto non scorre.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/95 px-4 backdrop-blur lg:hidden">
        <span className="font-bold tracking-[0.2em]">
          {messages.app.name}
          <span className="text-positive">.</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="sidebar"
          aria-label={open ? messages.nav.closeMenu : messages.nav.openMenu}
          className="cursor-pointer rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <aside
        id="sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-[transform,visibility] lg:translate-x-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full lg:visible",
        )}
      >
        <div className="hidden h-16 items-center px-5 lg:flex">
          <div>
            <p className="font-bold tracking-[0.2em]">
              {messages.app.name}
              <span className="text-positive">.</span>
            </p>
            <p className="text-[10px] uppercase tracking-widest text-subtle">
              {messages.app.tagline}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Navigazione principale">
          <NavLinks items={main} messages={messages} onNavigate={close} />
          {admin.length > 0 ? (
            <>
              <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                {messages.nav.administration}
              </p>
              <NavLinks items={admin} messages={messages} onNavigate={close} />
            </>
          ) : null}
          <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">
            {messages.nav.settings}
          </p>
          <NavLinks items={settings} messages={messages} onNavigate={close} />
        </nav>

        <div className="border-t border-border p-4">
          <p className="truncate text-sm font-medium" title={userLabel}>
            {userLabel}
          </p>
          <p className="text-xs text-muted">{roleLabel}</p>
          <form action="/auth/signout" method="post" className="mt-3">
            <button
              type="submit"
              className="-ml-2 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-negative-strong"
            >
              <LogOut size={16} aria-hidden="true" />
              {messages.common.signOut}
            </button>
          </form>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label={messages.nav.closeMenu}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={close}
        />
      ) : null}
    </>
  );
}
