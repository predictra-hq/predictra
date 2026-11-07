#!/usr/bin/env node
/**
 * Bootstrap dei Super Admin iniziali.
 *
 * Il primo accesso non può nascere da un invito "in app" (non esiste ancora un
 * amministratore). Questo script, eseguito UNA volta per ciascun Super Admin
 * iniziale da chi possiede la chiave segreta del progetto, crea l'invito con
 * ruolo SUPER_ADMIN e invia l'email tramite Supabase Auth.
 *
 * Uso (PowerShell o bash, con le variabili già nell'ambiente, MAI nel repo):
 *   node apps/web/scripts/bootstrap-super-admin.mjs persona@example.com
 *
 * Variabili richieste: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, APP_BASE_URL.
 * Non stampa né registra la chiave segreta.
 */
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const baseUrl = process.env.APP_BASE_URL;

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Uso: node apps/web/scripts/bootstrap-super-admin.mjs <email>");
  process.exit(1);
}
if (!url || !secret || !baseUrl) {
  console.error(
    "Mancano NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY o APP_BASE_URL nell'ambiente.",
  );
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: existingError } = await admin
  .from("invitations")
  .select("id, status")
  .ilike("email", email)
  .in("status", ["PENDING", "ACCEPTED"])
  .limit(1);
if (existingError) {
  console.error("Errore lettura inviti:", existingError.message);
  process.exit(1);
}
if (existing && existing.length > 0) {
  console.error(`Esiste già un invito ${existing[0].status} per ${email}. Nessuna azione.`);
  process.exit(1);
}

const { data: invitation, error: insertError } = await admin
  .from("invitations")
  .insert({ email, role: "SUPER_ADMIN", invited_by: null })
  .select("id")
  .single();
if (insertError) {
  console.error("Errore creazione invito:", insertError.message);
  process.exit(1);
}

const { data: invited, error: sendError } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${baseUrl}/accept-invite`,
});

await admin
  .from("invitations")
  .update(
    sendError
      ? { send_error: sendError.message.slice(0, 500) }
      : { sent_at: new Date().toISOString(), auth_user_id: invited.user?.id ?? null },
  )
  .eq("id", invitation.id);

await admin.from("audit_logs").insert({
  actor_id: null,
  action: "bootstrap.super_admin_invited",
  target_type: "invitation",
  target_id: invitation.id,
  metadata: { email },
});

if (sendError) {
  console.error(`Invito registrato ma email NON inviata: ${sendError.message}`);
  process.exit(2);
}
console.log(`Invito SUPER_ADMIN inviato a ${email}.`);
