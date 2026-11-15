import { hasPermission, highestRole } from "@predictra/shared-types";
import { ADMIN_NAV, MAIN_NAV_GROUPS, SETTINGS_NAV } from "@/components/shell/nav-config";
import { BottomNav } from "@/components/shell/bottom-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const m = getMessages();
  const role = highestRole(user.roles);
  const adminNav = ADMIN_NAV.filter(
    (item) => !item.permission || hasPermission(user.roles, item.permission),
  );

  return (
    <div className="min-h-screen">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {m.common.skipToContent}
      </a>
      <Sidebar
        messages={m}
        groups={MAIN_NAV_GROUPS}
        admin={adminNav}
        settings={SETTINGS_NAV}
        userLabel={user.displayName ?? user.email}
        roleLabel={role ? m.roles[role] : ""}
      />
      <main id="content" className="px-4 pb-24 pt-6 sm:px-8 lg:ml-64 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <BottomNav messages={m} />
    </div>
  );
}
