"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-config";

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
        if (item.milestone) {
          return (
            <li key={item.key}>
              <span
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-subtle"
                aria-disabled="true"
                title={`${messages.common.availableFrom} Milestone ${item.milestone}`}
              >
                {label}
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
                "block rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-positive-soft text-positive-strong"
                  : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {label}
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
          className="rounded-md p-2 text-muted hover:text-fg"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <aside
        id="sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
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
          <p className="truncate text-sm font-medium">{userLabel}</p>
          <p className="text-xs text-muted">{roleLabel}</p>
          <form action="/auth/signout" method="post" className="mt-3">
            <button type="submit" className="text-sm text-muted hover:text-negative-strong">
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
