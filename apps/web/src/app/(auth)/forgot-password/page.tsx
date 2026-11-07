import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: "Recupero password" };

/**
 * PREDICTRA non invia email: il link di reimpostazione lo genera un
 * amministratore (Administration → Utenti) e lo consegna a mano.
 */
export default function ForgotPasswordPage() {
  const m = getMessages();
  return (
    <Card>
      <h1 className="text-lg font-semibold">{m.auth.forgotTitle}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">{m.auth.forgotSubtitle}</p>
      <Link href="/login" className="text-sm text-muted hover:text-fg">
        {m.auth.backToLogin}
      </Link>
    </Card>
  );
}
