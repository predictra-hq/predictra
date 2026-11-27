"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, LogOut, Menu, RefreshCw, X } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { StyledName } from "@/components/community/styled-name";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { playSound } from "@/lib/sounds";
import { isNavItemActive, type NavGroup, type NavItem } from "./nav-config";
import { NAV_ICONS } from "./nav-icons";

export { NAV_ICONS };

interface SidebarProps {
  messages: Messages;
  groups: readonly NavGroup[];
  admin: readonly NavItem[];
  settings: readonly NavItem[];
  userLabel: string;
  /** Stile del nome e colore dell'avatar scelti nelle Preferenze. */
  nameColor: string | null;
  nameStyle: string | null;
  avatarStyle: string | null;
  /** Versione mostrata (es. «v1.0.0»). */
  release: string;
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
              >
                {icon}
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="text-xs uppercase tracking-wide">M{item.milestone}</span>
              </span>
            </li>
          );
        }
        const active = isNavItemActive(item, pathname);
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-positive-soft font-medium text-positive-strong shadow-[inset_2px_0_0_var(--color-positive)]"
                  : "text-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2",
              )}
            >
              {icon}
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <PendingHint />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ricarica i dati della pagina senza perdere la posizione: nell'app installata sul
 * telefono non c'è il pulsante di ricarica del browser.
 */
function RefreshButton({ label, doneLabel }: { label: string; doneLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Riscontro sempre visibile: la rotellina gira almeno un attimo anche se i dati arrivano
  // subito, poi compare la spunta. Senza, sembrava che il tocco non facesse nulla.
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(false);
  const busy = pending || spinning;
  return (
    <button
      type="button"
      onClick={() => {
        if (busy) return;
        setDone(false);
        setSpinning(true);
        startTransition(() => router.refresh());
        window.setTimeout(() => {
          setSpinning(false);
          setDone(true);
          playSound("tap");
          window.setTimeout(() => setDone(false), 1500);
        }, 700);
      }}
      aria-busy={busy}
      aria-label={label}
      className="mr-auto cursor-pointer rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2"
    >
      {done && !busy ? (
        <Check size={20} aria-hidden="true" className="text-positive-strong" />
      ) : (
        <RefreshCw size={20} aria-hidden="true" className={cn(busy && "animate-spin")} />
      )}
      <span className="sr-only" aria-live="polite">
        {done && !busy ? doneLabel : ""}
      </span>
    </button>
  );
}

/**
 * Puntino a destra della voce cliccata finché la pagina non arriva: riscontro immediato
 * senza spostare nulla (sempre presente, cambia solo l'opacità).
 */
function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full bg-positive transition-opacity",
        pending ? "opacity-100 motion-safe:animate-pulse" : "opacity-0",
      )}
    />
  );
}

const GROUP_TITLE = "px-3 text-xs font-semibold uppercase tracking-wider text-subtle";

/** Un gruppo del menu: titolo facoltativo e, se richiudibile, aperto solo quando serve. */
function NavGroupSection({
  group,
  messages,
  onNavigate,
}: {
  group: NavGroup;
  messages: Messages;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const links = <NavLinks items={group.items} messages={messages} onNavigate={onNavigate} />;
  if (!group.label) return <div className="mt-4 first:mt-0">{links}</div>;

  const title = messages.nav[group.label];
  if (!group.collapsible) {
    return (
      <div className="mt-4">
        <p className={cn(GROUP_TITLE, "mb-1")}>{title}</p>
        {links}
      </div>
    );
  }
  // Su una pagina del gruppo resta aperto, così la voce attiva è sempre visibile.
  const open = expanded || group.items.some((item) => isNavItemActive(item, pathname));
  const panelId = `nav-group-${group.id}`;
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setExpanded(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          GROUP_TITLE,
          "mb-1 flex w-full cursor-pointer items-center justify-between rounded-md py-1 hover:text-fg",
        )}
      >
        {title}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={panelId} hidden={!open}>
        {links}
      </div>
    </div>
  );
}

export function Sidebar({
  messages,
  groups,
  admin,
  settings,
  userLabel,
  nameColor,
  nameStyle,
  avatarStyle,
  release,
  roleLabel,
}: SidebarProps) {
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
      {/* Telefono: menu a sinistra, logo a destra. Barra fissa (non `sticky`): tirando giù la
          pagina non segue il rimbalzo e resta allineata al pulsante di Chiedi, anch’esso fisso. */}
      <div aria-hidden="true" className="h-[calc(3.5rem+env(safe-area-inset-top))] lg:hidden" />
      <div className="fixed inset-x-0 top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-bg px-4 pt-[env(safe-area-inset-top)] lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="sidebar"
          aria-label={open ? messages.nav.closeMenu : messages.nav.openMenu}
          className="-ml-2 cursor-pointer rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <RefreshButton label={messages.nav.refresh} doneLabel={messages.nav.refreshed} />
        <Link href="/dashboard" className="flex items-center gap-2.5 font-bold tracking-[0.2em]">
          {messages.app.name}
          <span className="-ml-2 text-positive" aria-hidden="true">
            .
          </span>
          <span className="sr-only"> · {messages.nav.dashboard}</span>
          <Logo className="size-7 shrink-0" />
        </Link>
      </div>

      <aside
        id="sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface pt-[env(safe-area-inset-top)] transition-[transform,visibility] lg:translate-x-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full lg:visible",
        )}
      >
        <Link href="/dashboard" className="hidden h-16 items-center gap-3 px-5 lg:flex">
          <Logo className="size-8 shrink-0" />
          <div>
            <p className="font-bold tracking-[0.2em]">
              {messages.app.name}
              <span className="text-positive" aria-hidden="true">
                .
              </span>
              <span className="sr-only"> · {messages.nav.dashboard}</span>
            </p>
            <p className="text-xs uppercase tracking-widest text-subtle">{messages.app.tagline}</p>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Navigazione principale">
          {groups.map((group) => (
            <NavGroupSection key={group.id} group={group} messages={messages} onNavigate={close} />
          ))}
          {admin.length > 0 ? (
            <NavGroupSection
              group={{ id: "admin", label: "administration", collapsible: true, items: admin }}
              messages={messages}
              onNavigate={close}
            />
          ) : null}
          <div className="mt-4 border-t border-border pt-3">
            <NavLinks items={settings} messages={messages} onNavigate={close} />
          </div>
        </nav>

        <div className="border-t border-border p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))]">
          <div className="flex items-center gap-3">
            <UserAvatar style={avatarStyle} name={userLabel} className="size-9" />
            <div className="min-w-0">
              <p className="truncate text-sm">
                <StyledName name={userLabel} color={nameColor} style={nameStyle} />
              </p>
              <p className="text-xs text-muted">{roleLabel}</p>
            </div>
          </div>
          <form action="/auth/signout" method="post" className="mt-3">
            <button
              type="submit"
              className="-ml-2 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-negative-strong"
            >
              <LogOut size={16} aria-hidden="true" />
              {messages.common.signOut}
            </button>
          </form>
          <p className="mt-2 text-xs text-subtle">{release}</p>
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
