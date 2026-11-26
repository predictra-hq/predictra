import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { StatusPage, statusLinkClass } from "@/components/shell/status-page";
import { getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: getMessages().pageTitles.notFound };

/** Indirizzo inesistente: stessa grafica del resto del sito, in italiano. */
export default function NotFound() {
  const m = getMessages().common;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <StatusPage
        icon={<SearchX size={28} aria-hidden="true" />}
        title={m.notFoundTitle}
        description={m.notFoundDescription}
      >
        <Link href="/dashboard" className={statusLinkClass}>
          {m.backToDashboard}
        </Link>
      </StatusPage>
    </main>
  );
}
