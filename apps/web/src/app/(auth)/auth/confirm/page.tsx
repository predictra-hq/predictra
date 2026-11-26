import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/ui/form";
import { Card } from "@/components/ui/primitives";
import { parseConfirmRequest } from "@/lib/auth/confirm";
import { getMessages } from "@/lib/i18n";
import { confirmLink } from "./actions";

export const metadata: Metadata = {
  title: getMessages().pageTitles.authConfirm,
  robots: { index: false, follow: false },
  // Il token è nell'indirizzo: non deve finire nel Referer di nessuna richiesta.
  referrer: "no-referrer",
};

/**
 * Pagina di arrivo dei link monouso generati da lib/auth/links.ts (nessuna email: vengono
 * consegnati a mano, ADR 0008). Aprirla non consuma il link: lo fa il pulsante, con una
 * Server Action. Le app di messaggistica aprono da sole gli indirizzi per mostrarne
 * l'anteprima e, se bastasse l'apertura, il destinatario troverebbe il link già usato.
 */
export default async function ConfirmLinkPage({ searchParams }: PageProps<"/auth/confirm">) {
  const params = await searchParams;
  const request = parseConfirmRequest((name) => params[name]);
  if (!request) redirect("/login?error=link");

  const m = getMessages().auth;
  return (
    <Card>
      <h1 className="text-lg font-semibold">{m.confirmTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        {request.type === "invite"
          ? m.confirmInvite
          : request.type === "recovery"
            ? m.confirmRecovery
            : m.confirmOther}
      </p>
      <form action={confirmLink}>
        <input type="hidden" name="token_hash" value={request.tokenHash} />
        <input type="hidden" name="type" value={request.type} />
        <input type="hidden" name="next" value={request.next} />
        <SubmitButton className="w-full">{m.confirmButton}</SubmitButton>
      </form>
      <p className="mt-4 text-xs text-subtle">{m.confirmNote}</p>
    </Card>
  );
}
