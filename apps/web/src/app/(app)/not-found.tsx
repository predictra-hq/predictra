import Link from "next/link";
import { SearchX } from "lucide-react";
import { StatusPage, statusLinkClass } from "@/components/shell/status-page";
import { getMessages } from "@/lib/i18n";

/** Elemento inesistente dentro l'app (es. partita o proposta non trovata). */
export default function AppNotFound() {
  const m = getMessages().common;
  return (
    <StatusPage
      icon={<SearchX size={28} aria-hidden="true" />}
      title={m.notFoundTitle}
      description={m.notFoundDescription}
    >
      <Link href="/dashboard" className={statusLinkClass}>
        {m.backToDashboard}
      </Link>
    </StatusPage>
  );
}
