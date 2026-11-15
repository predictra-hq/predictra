import type { Metadata } from "next";
import { Card } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: "Account sospeso" };

export default function SuspendedPage() {
  const m = getMessages();
  return (
    <Card>
      <h1 className="text-lg font-semibold text-negative-strong">{m.auth.suspendedTitle}</h1>
      <p className="mt-2 text-sm text-muted">{m.auth.suspendedBody}</p>
      <form action="/auth/signout" method="post" className="mt-5">
        <button type="submit" className="text-sm text-muted underline hover:text-fg">
          {m.common.signOut}
        </button>
      </form>
    </Card>
  );
}
