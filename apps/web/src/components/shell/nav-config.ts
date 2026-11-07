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
  { key: "matchCenter", href: "/match-center", milestone: 2 },
  { key: "statisticsCenter", href: "/statistics", milestone: 3 },
  { key: "betBuilder", href: "/bet-builder", milestone: 5 },
  { key: "marketIntelligence", href: "/markets", milestone: 3 },
  { key: "leagueIntelligence", href: "/leagues", milestone: 3 },
  { key: "bankroll", href: "/bankroll", milestone: 6 },
  { key: "tracker", href: "/tracker", milestone: 6 },
  { key: "modelIntelligence", href: "/models", milestone: 4 },
  { key: "dataCenter", href: "/data-center", milestone: 2 },
  { key: "askPredictra", href: "/ask", milestone: 8 },
];

export const ADMIN_NAV: readonly NavItem[] = [
  { key: "users", href: "/admin/users", permission: "users.read" },
  { key: "invitations", href: "/admin/invitations", permission: "invitations.manage" },
  { key: "audit", href: "/admin/audit", permission: "audit.read" },
];

export const SETTINGS_NAV: readonly NavItem[] = [
  { key: "security", href: "/settings/security" },
  { key: "preferences", href: "/settings/preferences" },
];
