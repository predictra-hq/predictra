import type { Permission } from "@predictra/shared-types";
import type { Messages } from "@/lib/i18n";

export interface NavItem {
  key: keyof Messages["nav"];
  href: string;
  /** Altri percorsi della stessa sezione: la voce resta evidenziata anche lì. */
  also?: readonly string[];
  /** Milestone in cui la sezione diventa disponibile; se presente la voce è disattivata. */
  milestone?: number;
  permission?: Permission;
}

/**
 * Navigazione principale. Le pagine affini stanno sotto una sola voce e si scelgono
 * con le schede in cima alla pagina (`SECTION_TABS`): menu corto, stesse pagine.
 */
export const MAIN_NAV: readonly NavItem[] = [
  { key: "dashboard", href: "/dashboard" },
  { key: "matchCenter", href: "/match-center" },
  { key: "betBuilder", href: "/bet-builder" },
  { key: "tracker", href: "/tracker", also: ["/bankroll"] },
  { key: "analysis", href: "/leagues", also: ["/statistics", "/markets"] },
  { key: "system", href: "/models", also: ["/data-center"] },
  { key: "askPredictra", href: "/ask" },
];

/** Schede delle sezioni che raggruppano più pagine. */
export const SECTION_TABS = {
  plays: [
    { key: "tracker", href: "/tracker" },
    { key: "bankroll", href: "/bankroll" },
  ],
  analysis: [
    { key: "leagueIntelligence", href: "/leagues" },
    { key: "statisticsCenter", href: "/statistics" },
    { key: "marketIntelligence", href: "/markets" },
  ],
  system: [
    { key: "modelIntelligence", href: "/models" },
    { key: "dataCenter", href: "/data-center" },
  ],
} as const satisfies Record<string, readonly NavItem[]>;
export type SectionGroup = keyof typeof SECTION_TABS;

export const ADMIN_NAV: readonly NavItem[] = [
  { key: "users", href: "/admin/users", permission: "users.read" },
  { key: "invitations", href: "/admin/invitations", permission: "invitations.manage" },
  { key: "audit", href: "/admin/audit", permission: "audit.read" },
  { key: "teamAliases", href: "/admin/team-aliases", permission: "providers.manage" },
  { key: "agent", href: "/admin/agent", permission: "agents.monitor" },
];

export const SETTINGS_NAV: readonly NavItem[] = [
  { key: "security", href: "/settings/security" },
  { key: "preferences", href: "/settings/preferences" },
];
