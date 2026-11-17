"use server";

import { redirect } from "next/navigation";
import { parseConfirmRequest } from "@/lib/auth/confirm";
import { createClient } from "@/lib/supabase/server";

/**
 * Consuma il link monouso (invito, recupero password) e apre la sessione. Avviene solo
 * qui, all'invio del modulo: aprire l'indirizzo non basta, così l'anteprima automatica di
 * una chat o di un antivirus non brucia il link prima del destinatario.
 */
export async function confirmLink(formData: FormData): Promise<void> {
  const request = parseConfirmRequest((name) => formData.get(name));
  if (!request) redirect("/login?error=link");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: request.type,
    token_hash: request.tokenHash,
  });
  redirect(error ? "/login?error=link" : request.next);
}
