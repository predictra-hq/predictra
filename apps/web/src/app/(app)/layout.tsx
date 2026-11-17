import { hasPermission, highestRole } from "@predictra/shared-types";
import { ADMIN_NAV, MAIN_NAV_GROUPS, SETTINGS_NAV } from "@/components/shell/nav-config";
import { AskLauncher } from "@/components/ask/ask-launcher";
import { BottomNav } from "@/components/shell/bottom-nav";
import { SectionNav } from "@/components/shell/section-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Tour } from "@/components/shell/tour";
import { UpdateNotice } from "@/components/shell/update-notice";
import { askProvider } from "@/lib/ask/provider";
import { cookies } from "next/headers";
import { isTourDone, TOUR_COOKIE } from "@/lib/tour";
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
    <div className="min-h-screen overflow-x-clip">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-1/2 focus:top-2 focus:z-50 focus:-translate-x-1/2 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
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
      <main
        id="content"
        className="px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pt-6 lg:ml-64 lg:py-10"
      >
        <div className="mx-auto max-w-6xl">
          <SectionNav messages={m} />
          {children}
        </div>
      </main>
      <BottomNav messages={m} />
      <AskLauncher enabled={askProvider() !== null} />
      <Tour messages={m.tour} done={isTourDone((await cookies()).get(TOUR_COOKIE)?.value)} />
      <UpdateNotice labels={{ message: m.common.updateAvailable, action: m.common.updateAction }} />
    </div>
  );
}
