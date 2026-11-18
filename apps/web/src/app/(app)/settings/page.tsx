import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Bell,
  BotMessageSquare,
  Cake,
  ChevronRight,
  Globe,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Palette,
  PenLine,
  ShieldCheck,
  Type,
  UserRound,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { hasPermission, highestRole } from "@predictra/shared-types";
import { avatarStyleOf } from "@/lib/profile/avatar";
import { StyledName } from "@/components/community/styled-name";
import { ADMIN_NAV } from "@/components/shell/nav-config";
import { NAV_ICONS } from "@/components/shell/nav-icons";
import { TourRestartRow } from "@/components/shell/tour";
import { Badge } from "@/components/ui/primitives";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ALERT_COOKIE, parseAlertThreshold } from "@/lib/alerts";
import { requireUser } from "@/lib/auth/dal";
import { isAdult, todayInRome } from "@/lib/community/community";
import { getOwnCommunityProfile } from "@/lib/community/queries";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { SOUND_COOKIE } from "@/lib/sounds";
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
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-positive-soft text-positive-strong">
        <Icon size={18} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center">{icon as ReactNode}</span>
  );
}

/**
 * Gruppo di voci in stile app: un titolo che dice di che tipo sono, una card, una riga per
 * voce. Ogni riga dice cosa cambi e mostra il valore attuale; tutta la riga si tocca.
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
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-subtle">
        {title}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {rows.map((row) => (
          <li key={row.href}>
            <Link
              href={row.href}
              className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 active:bg-surface-2"
            >
              <RowIcon icon={row.icon} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{row.label}</span>
                {row.value ? (
                  <span className="block truncate text-xs text-muted">{row.value}</span>
                ) : null}
              </span>
              {row.badge ? <Badge tone={row.badge.tone}>{row.badge.text}</Badge> : null}
              <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-subtle" />
            </Link>
          </li>
        ))}
        {children}
      </ul>
    </section>
  );
}

/**
 * Profilo: chi sei e tutto ciò che puoi cambiare, diviso per tipo (il tuo profilo, accesso
 * e sicurezza, app, aiuto, amministrazione). Ogni voce porta direttamente al riquadro giusto
 * e mostra il valore attuale, così si capisce cosa si sta per cambiare senza aprire nulla.
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
  const [community, { data: prefs }, jar] = await Promise.all([
    getOwnCommunityProfile(user.id),
    supabase.from("user_preferences").select("timezone").eq("user_id", user.id).maybeSingle(),
    cookies(),
  ]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const soundsOn = jar.get(SOUND_COOKIE)?.value === "on";
  const alertThreshold = parseAlertThreshold(jar.get(ALERT_COOKIE)?.value);
  const birthday = !community.birthDate
    ? p.birthdayMissing
    : isAdult(community.birthDate, todayInRome())
      ? p.birthdayUnlocked
      : p.birthdayUnderAge;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="sr-only">{p.title}</h1>
      <div className="flex items-center gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <UserAvatar style={user.avatarStyle} name={name} className="size-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg leading-tight">
            <StyledName
              name={name}
              color={user.nameColor}
              style={user.nameStyle}
              className="font-semibold"
            />
          </p>
          {user.displayName ? <p className="truncate text-sm text-muted">{user.email}</p> : null}
          {role ? <p className="mt-0.5 text-xs text-subtle">{m.roles[role]}</p> : null}
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

      <Group
        title={p.groupProfile}
        rows={[
          {
            href: "/settings/account#name",
            icon: UserRound,
            label: p.rowName,
            value: user.displayName ?? p.nameMissing,
          },
          {
            href: "/settings/account#avatar",
            icon: <UserAvatar style={user.avatarStyle} name={name} className="size-9" />,
            label: p.rowAvatar,
            value: pref.avatarStyles[avatarStyleOf(user.avatarStyle)],
          },
          {
            href: "/settings/account#name-style",
            icon: Type,
            label: p.rowNameStyle,
            value: (
              <StyledName
                name={user.displayName ?? user.email.split("@")[0]!}
                color={user.nameColor}
                style={user.nameStyle}
              />
            ),
          },
          { href: "/settings/account#birthday", icon: Cake, label: p.rowBirthday, value: birthday },
        ]}
      />

      <Group
        title={p.groupSecurity}
        rows={[
          {
            href: "/settings/security#mfa",
            icon: ShieldCheck,
            label: p.rowMfa,
            value: p.rowMfaHint,
            badge: user.hasMfa
              ? { text: p.mfaOn, tone: "positive" }
              : { text: p.mfaOff, tone: "warning" },
          },
          {
            href: "/settings/security#password",
            icon: KeyRound,
            label: p.rowPassword,
            value: p.rowPasswordHint,
          },
          {
            href: "/settings/security#sessions",
            icon: MonitorSmartphone,
            label: p.rowSessions,
            value: p.rowSessionsHint,
          },
        ]}
      />

      <Group
        title={p.groupApp}
        rows={[
          {
            href: "/settings/preferences#theme",
            icon: Palette,
            label: p.rowTheme,
            value: pref.themes[theme],
          },
          {
            href: "/settings/preferences#sounds",
            icon: Volume2,
            label: p.rowSounds,
            value: soundsOn ? pref.soundsOn : pref.soundsOff,
          },
          {
            href: "/settings/preferences#alerts",
            icon: Bell,
            label: p.rowAlerts,
            value: fillTemplate(pref.alertsFrom, { n: alertThreshold }),
          },
          {
            href: "/settings/preferences#region",
            icon: Globe,
            label: p.rowRegion,
            value: `${pref.italian} · ${prefs?.timezone ?? "Europe/Rome"}`,
          },
        ]}
      />

      <Group
        title={p.groupHelp}
        rows={[{ href: "/ask", icon: BotMessageSquare, label: p.rowAsk, value: p.rowAskHint }]}
      >
        <li>
          <TourRestartRow label={p.restartTour} hint={p.restartTourHint} />
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
