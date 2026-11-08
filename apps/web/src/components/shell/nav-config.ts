import type { Permission } from "@predictra/shared-types";
import type { Messages } from "@/lib/i18n";

export interface NavItem {
  key: keyof Messages["nav"];
  href: string;
  /** Milestone in cui la sezione diventa disponibile; se presente la voce è disattivata. */
  milestone?: number;
  permission?: Permission;
}

/** Navigazione principale (prompt master §16.1). */
export const MAIN_NAV: readonly NavItem[] = [
  { key: "dashboard", href: "/dashboard" },
  { key: "matchCenter", href: "/match-center" },
  { key: "statisticsCenter", href: "/statistics" },
  { key: "betBuilder", href: "/bet-builder" },
  { key: "marketIntelligence", href: "/markets" },
  { key: "leagueIntelligence", href: "/leagues" },
  { key: "bankroll", href: "/bankroll", milestone: 6 },
  { key: "tracker", href: "/tracker", milestone: 6 },
  { key: "modelIntelligence", href: "/models", milestone: 4 },
  { key: "dataCenter", href: "/data-center" },
  { key: "askPredictra", href: "/ask", milestone: 8 },
];

export const ADMIN_NAV: readonly NavItem[] = [
  { key: "users", href: "/admin/users", permission: "users.read" },
  { key: "invitations", href: "/admin/invitations", permission: "invitations.manage" },
  { key: "audit", href: "/admin/audit", permission: "audit.read" },
  { key: "teamAliases", href: "/admin/team-aliases", permission: "providers.manage" },
];

export const SETTINGS_NAV: readonly NavItem[] = [
  { key: "security", href: "/settings/security" },
  { key: "preferences", href: "/settings/preferences" },
];
