import type { Metadata } from "next";
import { AskChat } from "@/components/ask/ask-chat";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { askProvider } from "@/lib/ask/provider";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: getMessages().pageTitles.ask };

/** Ask PREDICTRA (ADR 0042): spiega i dati già calcolati, senza numeri propri. */
export default async function AskPage() {
  await requireUser();
  const m = getMessages().ask;
  const enabled = askProvider() !== null;

  return (
    <div>
      <PageHeader title={m.title} description={m.description} />
      {enabled ? <AskChat /> : <Alert tone="warning">{m.disabled}</Alert>}
      <p className="mt-6 text-xs text-subtle">{m.privacy}</p>
      <p className="mt-1 text-xs text-subtle">{m.disclaimer}</p>
    </div>
  );
}
