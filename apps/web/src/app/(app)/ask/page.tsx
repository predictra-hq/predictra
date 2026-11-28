import type { Metadata } from "next";
import { AskChat } from "@/components/ask/ask-chat";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { askProvider } from "@/lib/ask/provider";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: getMessages().pageTitles.ask };

/** Ask PREDICTRA (ADR 0042): spiega i dati già calcolati, senza numeri propri. */
export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  await requireUser();
  // Domanda già scritta da un'altra pagina (`?q=`, es. «Chiedi il rischio» in Costruisci):
  // si mostra nel campo e parte solo quando la si invia.
  const q = (await searchParams).q;
  const initial = typeof q === "string" ? q.trim().slice(0, 500) : "";
  const m = getMessages().ask;
  const enabled = askProvider() !== null;

  return (
    <div>
      <PageHeader title={m.title} description={m.description} />
      {enabled ? <AskChat initialQuestion={initial} /> : <Alert tone="warning">{m.disabled}</Alert>}
      <p className="mt-6 text-xs text-subtle">{m.privacy}</p>
      <p className="mt-1 text-xs text-subtle">{m.disclaimer}</p>
    </div>
  );
}
