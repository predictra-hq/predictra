import type { Permission } from "@predictra/shared-types";
import type { Messages } from "@/lib/i18n";

export interface NavItem {
  key: keyof Messages["nav"];
  href: string;
  /** Prefisso che rende attiva la voce, se diverso da `href` (es. più pagine sotto `/settings`). */
  match?: string;
  /** Milestone in cui la sezione diventa disponibile; se presente la voce è disattivata. */
  milestone?: number;
  permission?: Permission;
}

export interface NavGroup {
  /** Identificatore stabile del gruppo. */
  id: string;
  /** Titolo del gruppo; senza titolo le voci stanno da sole (inizio e fine del menu). */
  label?: keyof Messages["nav"];
  /** Chiuso finché non lo si apre o non si è su una sua pagina. */
  collapsible?: boolean;
  items: readonly NavItem[];
}

/**
 * Navigazione principale (prompt master §16.1), raggruppata per ciò che si vuole fare.
 * Gli indirizzi delle pagine non cambiano: cambiano solo ordine, gruppi e nomi nel menu.
 */
export const MAIN_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "home",
    items: [
      { key: "dashboard", href: "/dashboard" },
      { key: "askPredictra", href: "/ask" },
    ],
  },
  {
    id: "bets",
    label: "groupBets",
    items: [
      { key: "certainties", href: "/certezze" },
      { key: "betBuilder", href: "/bet-builder" },
    ],
  },
  {
    id: "football",
    label: "groupFootball",
    items: [
      { key: "matchCenter", href: "/match-center" },
      { key: "leagueIntelligence", href: "/leagues" },
    ],
  },
  {
    id: "money",
    label: "groupMoney",
    items: [
      { key: "bankroll", href: "/bankroll" },
      { key: "tracker", href: "/tracker" },
    ],
  },
  {
    id: "system",
    label: "groupSystem",
    collapsible: true,
    items: [
      { key: "marketIntelligence", href: "/markets" },
      { key: "statisticsCenter", href: "/statistics" },
      { key: "modelIntelligence", href: "/models" },
      { key: "dataCenter", href: "/data-center" },
    ],
  },
];

export const ADMIN_NAV: readonly NavItem[] = [
  { key: "users", href: "/admin/users", permission: "users.read" },
  { key: "invitations", href: "/admin/invitations", permission: "invitations.manage" },
  { key: "audit", href: "/admin/audit", permission: "audit.read" },
  { key: "teamAliases", href: "/admin/team-aliases", permission: "providers.manage" },
  { key: "agent", href: "/admin/agent", permission: "agents.monitor" },
];

/** Una sola voce: Sicurezza e Preferenze sono due schede della stessa sezione. */
export const SETTINGS_NAV: readonly NavItem[] = [
  { key: "settings", href: "/settings/security", match: "/settings" },
];

/** Schede della sezione Impostazioni. */
export const SETTINGS_TABS = [
  { key: "security", href: "/settings/security" },
  { key: "preferences", href: "/settings/preferences" },
] as const satisfies readonly NavItem[];

/** Vero se `pathname` è la pagina della voce o una sua sottopagina. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const base = item.match ?? item.href;
  return pathname === base || pathname.startsWith(`${base}/`);
}
