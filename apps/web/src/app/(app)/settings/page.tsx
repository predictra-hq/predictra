import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BotMessageSquare,
  ChevronRight,
  LogOut,
  Palette,
  PenLine,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { hasPermission, highestRole } from "@predictra/shared-types";
import { StyledName } from "@/components/community/styled-name";
import { ADMIN_NAV } from "@/components/shell/nav-config";
import { NAV_ICONS } from "@/components/shell/nav-icons";
import { TourRestartRow } from "@/components/shell/tour";
import { Badge } from "@/components/ui/primitives";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ALERT_COOKIE, parseAlertThreshold } from "@/lib/alerts";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { SOUND_COOKIE, soundsOnFromCookie } from "@/lib/sounds";
import { createClient } from "@/lib/supabase/server";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { formatRelease } from "@/lib/version";

export const metadata: Metadata = { title: "Profilo" };

export interface ProfileRow {
  href: string;
  icon: LucideIcon | ReactNode;
  label: string;
  /** Valore attuale, scritto in chiaro (es. «Scuro», «Non indicata»). */
  value?: ReactNode;
  badge?: { text: string; tone: "positive" | "warning" };
}

/** Icona della riga: un'icona di Lucide in un riquadro, oppure un elemento già pronto (avatar). */
function RowIcon({ icon }: { icon: ProfileRow["icon"] }) {
  if (typeof icon === "function" || (typeof icon === "object" && icon && "render" in icon)) {
    const Icon = icon as LucideIcon;
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-positive-soft text-positive-strong">
        <Icon size={15} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex size-7 shrink-0 items-center justify-center">{icon as ReactNode}</span>
  );
}

/**
 * Gruppo di voci in stile app: un titolo che dice di che tipo sono, una card, una riga per
 * voce. Ogni riga è compatta: cosa cambi a sinistra, valore attuale a destra sulla stessa
 * riga; tutta la riga si tocca.
 */
function Group({
  title,
  rows,
  children,
}: {
  title: string;
  rows: readonly ProfileRow[];
  children?: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-subtle">
        {title}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {rows.map((row) => (
          <li key={row.href}>
            <Link
              href={row.href}
              className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-surface-2 active:bg-surface-2"
            >
              <RowIcon icon={row.icon} />
              <span className="shrink-0 font-medium">{row.label}</span>
              <span className="min-w-0 flex-1 truncate text-right text-xs text-muted">
                {row.value}
              </span>
              {row.badge ? <Badge tone={row.badge.tone}>{row.badge.text}</Badge> : null}
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-subtle" />
            </Link>
          </li>
        ))}
        {children}
      </ul>
    </section>
  );
}

/**
 * Profilo: una voce per pagina (ADR 0064). Il tuo profilo (nome, immagine, stile), accesso e
 * sicurezza, preferenze dell'app; poi aiuto e amministrazione. Ogni voce mostra in breve il
 * valore attuale.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const m = getMessages();
  const p = m.profile;
  const pref = m.preferences;
  const role = highestRole(user.roles);
  const name = user.displayName ?? user.email;
  const admin = ADMIN_NAV.filter(
    (item) => !item.permission || hasPermission(user.roles, item.permission),
  );

  const supabase = await createClient();
  const [{ data: prefs }, jar] = await Promise.all([
    supabase.from("user_preferences").select("timezone").eq("user_id", user.id).maybeSingle(),
    cookies(),
  ]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const soundsOn = soundsOnFromCookie(jar.get(SOUND_COOKIE)?.value);
  const alertThreshold = parseAlertThreshold(jar.get(ALERT_COOKIE)?.value);

  return (
    <div>
      <h1 className="sr-only">{p.title}</h1>
      <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3">
        <UserAvatar style={user.avatarStyle} name={name} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base leading-tight">
            <StyledName
              name={name}
              color={user.nameColor}
              style={user.nameStyle}
              className="font-semibold"
            />
          </p>
          <p className="truncate text-xs text-muted">
            {user.displayName ? user.email : null}
            {user.displayName && role ? " · " : null}
            {role ? m.roles[role] : null}
          </p>
        </div>
        <Link
          href="/settings/account"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          <PenLine size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{p.editProfile}</span>
          <span className="sr-only sm:hidden">{p.editProfile}</span>
        </Link>
      </div>

      {/* Stessa larghezza delle altre pagine: gruppi affiancati dal computer (ADR 0067). */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Group
          title={p.groupProfile}
          rows={[
            {
              href: "/settings/account",
              icon: <UserAvatar style={user.avatarStyle} name={name} className="size-7" />,
              label: p.rowProfile,
              value: (
                <StyledName
                  name={user.displayName ?? user.email.split("@")[0]!}
                  color={user.nameColor}
                  style={user.nameStyle}
                />
              ),
            },
            {
              href: "/settings/security",
              icon: ShieldCheck,
              label: p.rowSecurity,
              value: p.securityValue,
              badge: user.hasMfa
                ? { text: p.mfaOn, tone: "positive" }
                : { text: p.mfaOff, tone: "warning" },
            },
            {
              href: "/settings/preferences",
              icon: Palette,
              label: p.rowPreferences,
              value: [
                pref.themes[theme],
                soundsOn ? pref.soundsOn : pref.soundsOff,
                fillTemplate(pref.alertsFrom, { n: alertThreshold }),
                prefs?.timezone ?? "Europe/Rome",
              ].join(" · "),
            },
          ]}
        />

        <Group
          title={p.groupHelp}
          rows={[{ href: "/ask", icon: BotMessageSquare, label: p.rowAsk }]}
        >
          <li>
            <TourRestartRow label={p.restartTour} />
          </li>
        </Group>

        {admin.length > 0 ? (
          <Group
            title={m.nav.administration}
            rows={admin.map((item) => ({
              href: item.href,
              icon: NAV_ICONS[item.key] ?? ShieldCheck,
              label: m.nav[item.key],
            }))}
          />
        ) : null}
      </div>

      {/* Esci: a tutta larghezza in fondo, ben visibile anche sul computer. */}
      <form action="/auth/signout" method="post" className="mt-6">
        <button
          type="submit"
          className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-card)] border border-negative/40 bg-negative-soft text-base font-semibold text-negative-strong transition-colors hover:bg-negative/20"
        >
          <LogOut size={18} aria-hidden="true" />
          {m.common.signOut}
        </button>
      </form>
      <p className="mt-3 text-center text-xs text-subtle">
        {m.app.name} {formatRelease()}
      </p>
    </div>
  );
}
