#!/usr/bin/env node
/**
 * Verifica su un ambiente reale (DEV) dell'isolamento dei dati personali di M6
 * (ADR 0030), senza browser e senza credenziali di persone reali.
 *
 * 1. Crea tre account TEMPORANEI di prova (due USER e un SUPER_ADMIN) con password
 *    casuali, mai stampate.
 * 2. Si autentica come ciascuno e lavora attraverso PostgREST con il JWT dell'utente:
 *    valgono le stesse regole RLS dell'app.
 * 3. Controlla: ognuno vede e modifica solo i propri dati; il Super Admin non vede
 *    nulla; un limite personale blocca una giocata; saldo e disponibile corretti.
 * 4. Cancella SEMPRE gli account (e a cascata i loro dati), anche in caso di errore.
 *
 * Uso (in GitHub Actions: workflow "Verifica DEV"):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... node apps/web/scripts/verify-bankroll-isolation.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY nell'ambiente.");
  process.exit(2);
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, secret, options);
const run = randomUUID().slice(0, 8);
const created = [];
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "KO "} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function createUser(label, role) {
  const email = `verifica-m6-${run}-${label}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Creazione utente ${label}: ${error?.message}`);
  created.push(data.user.id);
  const { error: roleError } = await admin
    .from("user_roles")
    .insert({ user_id: data.user.id, role });
  if (roleError) throw new Error(`Ruolo ${label}: ${roleError.message}`);
  const client = createClient(url, secret, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Accesso ${label}: ${signInError.message}`);
  return { id: data.user.id, client };
}

async function main() {
  const alice = await createUser("a", "USER");
  const bob = await createUser("b", "USER");
  const boss = await createUser("s", "SUPER_ADMIN");

  // Le richieste devono girare come utente (RLS), non con i privilegi della chiave.
  const { data: ownProfiles } = await alice.client.from("profiles").select("id");
  if (ownProfiles?.length !== 1 || ownProfiles[0].id !== alice.id) {
    throw new Error("Le richieste non girano come utente: verifica non attendibile.");
  }
  check("le richieste girano con i permessi dell'utente (RLS attiva)", true);

  // Utente A: bankroll, deposito, due giocate (una chiusa).
  const { data: bankroll, error: bankrollError } = await alice.client
    .from("bankrolls")
    .insert({ name: `DEMO verifica ${run}`, kind: "SIMULATED" })
    .select("id")
    .single();
  if (bankrollError) throw new Error(`Bankroll di A: ${bankrollError.message}`);
  const bankrollId = bankroll.id;
  await alice.client
    .from("bankroll_movements")
    .insert({ bankroll_id: bankrollId, kind: "DEPOSIT", amount: 100 });
  const bet = (stake, odds) => ({
    bankroll_id: bankrollId,
    description: "DEMO verifica",
    market: "1X2",
    selection: "1",
    odds,
    stake,
  });
  const { data: openBet } = await alice.client
    .from("bets")
    .insert(bet(10, 2))
    .select("id")
    .single();
  const { data: wonBet } = await alice.client.from("bets").insert(bet(5, 3)).select("id").single();
  await alice.client.from("bets").update({ status: "WON" }).eq("id", wonBet.id);

  const { data: summary } = await alice.client
    .from("v_bankroll_summary")
    .select("balance, available, open_bets, settled_bets")
    .eq("bankroll_id", bankrollId)
    .single();
  check(
    "saldo e disponibile di A (100 + 10 di vincita, 10 aperti)",
    Number(summary?.balance) === 110 && Number(summary?.available) === 100,
    `saldo ${summary?.balance}, disponibile ${summary?.available}`,
  );

  // Utente B: non vede e non tocca nulla di A.
  for (const relation of [
    "bankrolls",
    "bankroll_movements",
    "bets",
    "v_bets",
    "v_bankroll_summary",
  ]) {
    const { data } = await bob.client.from(relation).select("*");
    check(`B non vede ${relation} di A`, (data ?? []).length === 0, `${(data ?? []).length} righe`);
  }
  const { error: foreignInsert } = await bob.client.from("bets").insert(bet(1, 2));
  check("B non può registrare giocate nel bankroll di A", Boolean(foreignInsert));
  const { data: foreignUpdate } = await bob.client
    .from("bets")
    .update({ stake: 999 })
    .eq("id", openBet.id)
    .select("id");
  check("B non può modificare le giocate di A", (foreignUpdate ?? []).length === 0);
  const { data: foreignDelete } = await bob.client
    .from("bankrolls")
    .delete()
    .eq("id", bankrollId)
    .select("id");
  check("B non può cancellare il bankroll di A", (foreignDelete ?? []).length === 0);

  // Super Admin: nessun accesso ai dati personali.
  for (const relation of ["bankrolls", "bets", "v_bankroll_summary"]) {
    const { data } = await boss.client.from(relation).select("*");
    check(
      `il Super Admin non vede ${relation}`,
      (data ?? []).length === 0,
      `${(data ?? []).length} righe`,
    );
  }

  // Limite personale.
  await alice.client.from("personal_limits").upsert({ bankroll_id: bankrollId, max_stake: 5 });
  const { error: limitError } = await alice.client.from("bets").insert(bet(10, 2));
  check(
    "un limite personale blocca la giocata",
    limitError?.code === "23514" && /Limite personale superato/.test(limitError.message),
    limitError?.message ?? "nessun errore",
  );

  // A vede ancora i propri dati intatti.
  const { data: stillThere } = await alice.client
    .from("bets")
    .select("id, stake")
    .eq("id", openBet.id)
    .single();
  check("i dati di A sono intatti", Number(stillThere?.stake) === 10);
}

let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  console.error(`Errore: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`Cancellazione di un account di prova non riuscita: ${error.message}`);
  }
  console.log(`Account di prova cancellati: ${created.length}`);
}

const ko = results.filter((r) => !r.ok).length;
console.log(
  `Esito: ${results.length - ko} controlli superati, ${ko} falliti${failed ? ", verifica interrotta" : ""}.`,
);
process.exit(failed || ko > 0 ? 1 : 0);
