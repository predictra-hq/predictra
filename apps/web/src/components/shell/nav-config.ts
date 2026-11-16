import type { Permission } from "@predictra/shared-types";
import type { Messages } from "@/lib/i18n";

export interface NavItem {
  key: keyof Messages["nav"];
  href: string;
  /** Prefisso che rende attiva la voce, se diverso da `href` (es. più pagine sotto `/settings`). */
  match?: string;
  /** Altre pagine della stessa sezione (schede interne) che rendono attiva la voce. */
  alsoMatch?: readonly string[];
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
];

/** Barra in basso sul telefono: le pagine di tutti i giorni. */
export const BOTTOM_NAV: readonly NavItem[] = [
  { key: "dashboard", href: "/dashboard" },
  { key: "matchCenter", href: "/match-center" },
  { key: "certainties", href: "/certezze" },
  { key: "betBuilder", href: "/bet-builder" },
  { key: "profile", href: "/settings", alsoMatch: ["/bankroll", "/tracker"] },
];

/** Schede interne delle sezioni di amministrazione: pagine che parlano della stessa cosa. */
export const ADMIN_SECTIONS = {
  system: [
    { key: "modelIntelligence", href: "/models" },
    { key: "agent", href: "/admin/agent" },
    { key: "dataCenter", href: "/data-center" },
  ],
  people: [
    { key: "users", href: "/admin/users" },
    { key: "invitations", href: "/admin/invitations" },
    { key: "audit", href: "/admin/audit" },
  ],
  football: [
    { key: "marketIntelligence", href: "/markets" },
    { key: "statisticsCenter", href: "/statistics" },
    { key: "teamAliases", href: "/admin/team-aliases" },
  ],
} as const satisfies Record<string, readonly NavItem[]>;

export type AdminSection = keyof typeof ADMIN_SECTIONS;

const others = (section: AdminSection) => ADMIN_SECTIONS[section].slice(1).map((t) => t.href);

/** Amministrazione: tre sezioni, ognuna con le sue schede interne. */
export const ADMIN_NAV: readonly NavItem[] = [
  {
    key: "adminSystem",
    href: "/models",
    alsoMatch: others("system"),
    permission: "agents.monitor",
  },
  {
    key: "adminPeople",
    href: "/admin/users",
    alsoMatch: others("people"),
    permission: "users.read",
  },
  {
    key: "adminFootball",
    href: "/markets",
    alsoMatch: others("football"),
    permission: "agents.monitor",
  },
];

/** Una sola voce: il Profilo porta a Sicurezza e Preferenze. */
export const SETTINGS_NAV: readonly NavItem[] = [{ key: "profile", href: "/settings" }];

/** Schede della sezione Impostazioni. */
export const SETTINGS_TABS = [
  { key: "security", href: "/settings/security" },
  { key: "preferences", href: "/settings/preferences" },
] as const satisfies readonly NavItem[];

/** Vero se `pathname` è la pagina della voce o una sua sottopagina. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const bases = [item.match ?? item.href, ...(item.alsoMatch ?? [])];
  return bases.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}
