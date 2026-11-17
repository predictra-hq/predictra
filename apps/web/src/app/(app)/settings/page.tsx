import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { hasPermission, highestRole } from "@predictra/shared-types";
import { ADMIN_NAV, type NavItem } from "@/components/shell/nav-config";
import { NAV_ICONS } from "@/components/shell/nav-icons";
import { TourRestartButton } from "@/components/shell/tour";
import { Badge } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { formatRelease } from "@/lib/version";
import { UserAvatar } from "@/components/ui/user-avatar";

export const metadata: Metadata = { title: "Profilo" };

interface Row {
  key: NavItem["key"];
  href: string;
  hint?: string;
  badge?: { text: string; tone: "positive" | "warning" };
}

/** Gruppo di voci in stile app: una card, una riga per voce, tutta la riga si tocca. */
function Group({ title, rows }: { title: string; rows: readonly Row[] }) {
  const nav = getMessages().nav;
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-subtle">
        {title}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {rows.map((row) => {
          const Icon = NAV_ICONS[row.key];
          return (
            <li key={row.href}>
              <Link
                href={row.href}
                className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 active:bg-surface-2"
              >
                {Icon ? (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-positive-soft text-positive-strong">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{nav[row.key]}</span>
                  {row.hint ? <span className="block text-xs text-muted">{row.hint}</span> : null}
                </span>
                {row.badge ? <Badge tone={row.badge.tone}>{row.badge.text}</Badge> : null}
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-subtle" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Profilo: chi sei e tutto ciò che non sta nella barra in basso (soldi, account,
 * amministrazione), come la pagina "profilo" di un'app.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const m = getMessages();
  const p = m.profile;
  const role = highestRole(user.roles);
  const name = user.displayName ?? user.email;
  const admin = ADMIN_NAV.filter(
    (item) => !item.permission || hasPermission(user.roles, item.permission),
  );

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="sr-only">{p.title}</h1>
      <div className="flex items-center gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <UserAvatar userId={user.id} className="size-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight">{name}</p>
          {user.displayName ? <p className="truncate text-sm text-muted">{user.email}</p> : null}
          {role ? <p className="mt-0.5 text-xs text-subtle">{m.roles[role]}</p> : null}
        </div>
      </div>

      <Group
        title={p.account}
        rows={[
          {
            key: "security",
            href: "/settings/security",
            hint: p.securityHint,
            badge: user.hasMfa
              ? { text: p.mfaOn, tone: "positive" }
              : { text: p.mfaOff, tone: "warning" },
          },
          { key: "preferences", href: "/settings/preferences", hint: p.preferencesHint },
        ]}
      />
      {admin.length > 0 ? (
        <Group
          title={m.nav.administration}
          rows={admin.map((item) => ({ key: item.key, href: item.href }))}
        />
      ) : null}

      <TourRestartButton label={p.restartTour} />

      <form action="/auth/signout" method="post" className="mt-6">
        <button
          type="submit"
          className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-card)] border border-negative/40 bg-negative-soft font-medium text-negative-strong transition-colors hover:bg-negative/20"
        >
          <LogOut size={18} aria-hidden="true" />
          {m.common.signOut}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-subtle">
        {m.app.name} {formatRelease()}
      </p>
    </div>
  );
}
