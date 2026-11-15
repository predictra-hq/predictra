"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { StatusPage, statusLinkClass } from "@/components/shell/status-page";
import { Button } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";

/**
 * Errore imprevisto in una sezione dell'app: il menu resta visibile e si può
 * riprovare senza ricaricare tutto. Nessun dettaglio tecnico viene mostrato.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const m = getMessages().common;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert">
      <StatusPage
        icon={<TriangleAlert size={28} aria-hidden="true" className="text-warning" />}
        title={m.errorTitle}
        description={m.errorDescription}
      >
        <Button type="button" onClick={() => retry()}>
          {m.retry}
        </Button>
        <Link href="/dashboard" className={statusLinkClass}>
          {m.backToDashboard}
        </Link>
      </StatusPage>
    </div>
  );
}
