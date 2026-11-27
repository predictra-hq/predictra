#!/usr/bin/env node
/**
 * Audit di accessibilità (M8, B1) con axe-core su tutte le pagine dell'app, con dati
 * reali di DEV e senza credenziali di persone reali.
 *
 * 1. Crea un Super Admin TEMPORANEO con password casuale (mai stampata) e 2FA TOTP
 *    attivata via API, più un bankroll `DEMO` con un movimento, così le tabelle
 *    personali non sono vuote.
 * 2. Con Chromium (Playwright) accede all'app indicata da APP_URL come farebbe una
 *    persona: login, codice 2FA, poi ogni pagina, anche in larghezza mobile.
 * 3. Su ogni pagina esegue axe (WCAG 2.1 A e AA) e un controllo da tastiera: il primo
 *    Tab raggiunge il link "Vai al contenuto". In larghezza telefono (375 px) controlla
 *    anche che nessun elemento esca dallo schermo (pagina che scorre di lato).
 * 4. Su ogni pagina raccoglie anche gli errori di funzionamento: eccezioni JavaScript,
 *    errori nella console del browser (es. violazioni della CSP) e risposte HTTP 4xx/5xx
 *    dell'app (pagina, dati, Server Action).
 * 5. Cancella SEMPRE l'account (e a cascata i suoi dati), anche in caso di errore.
 *
 * Esce con codice 1 se c'è almeno una violazione. Riepilogo anche in GITHUB_STEP_SUMMARY.
 *
 * Uso (in GitHub Actions: workflow "Verifica DEV", check `accessibility`):
 *   APP_URL=http://localhost:3000 NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node apps/web/scripts/verify-accessibility.mjs
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { AxeBuilder } from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!url || !secret) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY nell'ambiente.");
  process.exit(2);
}

/** Pagine di cui salvare uno screenshot (artefatto del run) se SCREENSHOT_DIR è impostata. */
const SCREENSHOTS = new Set([
  "/dashboard",
  "/dashboard (mobile)",
  "/certainties",
  "/certainties (mobile)",
  "/match-center (mobile)",
  "/match-center/[id] (mobile)",
  "/leagues (mobile)",
  "/bet-builder",
  "/bet-builder (mobile)",
  "/bet-builder/past (mobile)",
  "/bet-builder/builder",
  "/bet-builder/builder (mobile)",
  "/locker-room (mobile)",
  "/teams (mobile)",
  "/settings (mobile)",
  // Mai /admin/users: mostra le email degli utenti.
]);

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const PAGES = [
  "/dashboard",
  "/certainties",
  "/match-center",
  "/data-center",
  "/markets",
  "/statistics",
  "/leagues",
  "/teams",
  "/reliability",
  "/models",
  "/bet-builder",
  "/bet-builder/builder",
  "/bet-builder/slips",
  "/bet-builder/results",
  "/bet-builder/past",
  "/accounts",
  "/tracker",
  "/performance",
  "/locker-room",
  "/ask",
  "/settings",
  "/settings/preferences",
  "/settings/security",
  "/admin/users",
  "/admin/invitations",
  "/admin/audit",
  "/admin/agent",
  "/admin/team-aliases",
];

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, secret, options);
const run = randomUUID().slice(0, 8);
const results = [];

// --- TOTP (RFC 6238) -------------------------------------------------------------

function base32(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

const step = () => Math.floor(Date.now() / 30_000);

function totp(secretB32, counter = step()) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Un codice TOTP vale una volta sola: aspetta l'intervallo successivo a `after`. */
async function freshCode(secretB32, after) {
  while (step() <= after) await new Promise((r) => setTimeout(r, 1000));
  return { code: totp(secretB32), counter: step() };
}

// --- Account temporaneo --------------------------------------------------------------

async function createSuperAdmin() {
  const email = `verifica-a11y-${run}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Creazione utente: ${error?.message}`);
  const id = data.user.id;
  try {
    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ user_id: id, role: "SUPER_ADMIN" });
    if (roleError) throw new Error(`Ruolo: ${roleError.message}`);

    const client = createClient(url, secret, options);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`Accesso: ${signInError.message}`);
    const { data: factor, error: enrollError } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `verifica-${run}`,
    });
    if (enrollError) throw new Error(`2FA: ${enrollError.message}`);
    const totpSecret = factor.totp.secret;
    const first = { code: totp(totpSecret), counter: step() };
    const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: first.code,
    });
    if (verifyError) throw new Error(`Verifica 2FA: ${verifyError.message}`);

    // Dati DEMO personali, così bankroll e movimenti mostrano una tabella.
    const { data: bankroll, error: bankrollError } = await client
      .from("bankrolls")
      .insert({ name: `DEMO accessibilità ${run}`, kind: "SIMULATED" })
      .select("id")
      .single();
    if (bankrollError) throw new Error(`Bankroll DEMO: ${bankrollError.message}`);
    await client
      .from("bankroll_movements")
      .insert({ bankroll_id: bankroll.id, kind: "DEPOSIT", amount: 100, note: "DEMO" });

    // Schedine DEMO, così "Le mie schedine" mostra schede vere (una da proposta, se c'è).
    await createDemoSlips(client);

    return { id, email, password, totpSecret, lastCounter: first.counter };
  } catch (e) {
    await admin.auth.admin.deleteUser(id);
    throw e;
  }
}

/** Schedine DEMO con la sessione dell'utente temporaneo (RLS come nell'app). */
async function createDemoSlips(client) {
  const slips = [];
  const { data: proposal } = await admin
    .from("v_active_bet_proposals")
    .select("proposal_id")
    .limit(1)
    .maybeSingle();
  if (proposal) {
    const { data: legs } = await admin
      .from("bet_proposal_legs")
      .select("leg_no, match_id, market, line, selection")
      .eq("proposal_id", proposal.proposal_id)
      .order("leg_no");
    if (legs?.length) slips.push({ name: "DEMO da proposta", source: proposal.proposal_id, legs });
  }
  const { data: prediction } = await admin
    .from("v_active_predictions")
    .select("match_id")
    .eq("market", "1X2")
    .gte("kickoff_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (prediction) {
    slips.push({
      name: "DEMO manuale",
      source: null,
      legs: [
        { leg_no: 1, match_id: prediction.match_id, market: "1X2", line: null, selection: "HOME" },
      ],
    });
  }
  for (const slip of slips) {
    const { data, error } = await client
      .from("user_bet_slips")
      .insert({ name: slip.name, source_proposal_id: slip.source })
      .select("id")
      .single();
    if (error) throw new Error(`Schedina DEMO: ${error.message}`);
    const { error: legsError } = await client
      .from("user_bet_slip_selections")
      .insert(slip.legs.map((l) => ({ ...l, slip_id: data.id })));
    if (legsError) throw new Error(`Selezioni DEMO: ${legsError.message}`);
  }
}

// --- Controlli -----------------------------------------------------------------------

/** Errori di funzionamento della pagina in corso (riazzerati a ogni audit). */
let runtime = [];

function watchRuntime(page) {
  page.on("pageerror", (e) => runtime.push(`eccezione JS: ${String(e.message).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") runtime.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && u.origin === appUrl) {
      runtime.push(`HTTP ${r.status()} ${u.pathname}${u.search.slice(0, 60)}`);
    }
  });
}

/**
 * Pagine di cui stampare il testo visibile nel log (PRINT_TEXT=1): serve a controllare
 * cosa mostrano davvero, senza scaricare gli screenshot. Solo pagine senza dati personali.
 */
const PRINT_TEXT = new Set(["/dashboard", "/certainties", "/match-center", "/match-center/[id]"]);

async function printText(page, label) {
  if (process.env.PRINT_TEXT !== "1" || !PRINT_TEXT.has(label)) return;
  const text = await page
    .locator("main")
    .innerText()
    .catch(() => "");
  const compact = text.replace(/\n{2,}/g, "\n").slice(0, 4000);
  console.log(`----- TESTO ${label} -----\n${compact}\n----- FINE ${label} -----`);
}

/**
 * Con PRINT_SHOTS=1 stampa nel log una foto leggera (JPEG in base64, a pezzi) delle pagine
 * a larghezza telefono: serve a rivederle quando l'artefatto del run non è scaricabile.
 */
async function printShot(page, label) {
  if (process.env.PRINT_SHOTS !== "1" || (page.viewportSize()?.width ?? 1280) >= 640) return;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const buffer = await page.screenshot({
    type: "jpeg",
    quality: 45,
    fullPage: true,
    clip: { x: 0, y: 0, width: 375, height: Math.min(height, 2600) },
  });
  const data = buffer.toString("base64");
  for (let i = 0; i < data.length; i += 4000)
    console.log(`SHOT|${label}|${data.slice(i, i + 4000)}`);
}

async function audit(page, path, label = path) {
  runtime = [];
  const response = await page.goto(`${appUrl}${path}`, { waitUntil: "networkidle" });
  const status = response?.status() ?? 0;
  const landed = new URL(page.url()).pathname;
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  await printText(page, label);
  await printShot(page, label);
  if (process.env.SCREENSHOT_DIR && SCREENSHOTS.has(label)) {
    const name = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png`, fullPage: true });
  }

  // Tastiera: il primo Tab porta al link per saltare al contenuto (pagine dell'app).
  let skipLink = null;
  // Le pagine di accesso (login, 2FA) contengono solo il form: niente link per saltare.
  if (!["/login", "/forgot-password", "/mfa"].some((p) => path.startsWith(p))) {
    // Dopo il caricamento la tabulazione parte dall'inizio del documento.
    await page.keyboard.press("Tab");
    skipLink = await page.evaluate(
      () => document.activeElement?.getAttribute("href") === "#content",
    );
  }

  const overflow = await horizontalOverflow(page);
  const errors = [...new Set([...runtime, ...overflow])];
  results.push({ label, status, landed, violations, skipLink, errors });
  const marker =
    violations.length === 0 && skipLink !== false && status < 400 && errors.length === 0
      ? "OK"
      : "KO";
  console.log(`${marker} ${label} (${status}${landed !== path ? ` → ${landed}` : ""})`);
  for (const v of violations) {
    console.log(`   - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elementi)`);
    for (const n of v.nodes.slice(0, 3)) console.log(`       ${n.target.join(" ")}`);
  }
  if (skipLink === false) console.log("   - il primo Tab non raggiunge «Vai al contenuto»");
  for (const e of errors) console.log(`   - ${e}`);
}

/**
 * Telefono: elementi che escono dallo schermo a destra o a sinistra (la pagina scorrerebbe
 * di lato). Non contano quelli dentro un contenitore che scorre o taglia da sé e sta nello
 * schermo (tabelle larghe), né quelli invisibili (menu chiuso, testo per screen reader).
 * Si segnala solo l'elemento più esterno di ogni gruppo.
 */
async function horizontalOverflow(page) {
  const vw = page.viewportSize()?.width ?? 1280;
  if (vw >= 640) return [];
  return page.evaluate((vw) => {
    const out = [];
    const roots = [...document.querySelectorAll("main, .sticky.top-0, nav.fixed")];
    const exceeds = (r) => r.right > vw + 1 || r.left < -1;
    const contained = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (a.matches(".min-h-screen")) break;
        const ox = getComputedStyle(a).overflowX;
        if (ox !== "visible" && !exceeds(a.getBoundingClientRect())) return true;
      }
      return false;
    };
    for (const root of roots) {
      for (const el of root.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1 || !exceeds(r)) continue;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.display === "none") continue;
        if (contained(el)) continue;
        const parent = el.parentElement;
        if (parent && exceeds(parent.getBoundingClientRect()) && !contained(parent)) continue;
        const cls = (el.getAttribute("class") ?? "").slice(0, 80);
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
        out.push(
          `fuori schermo (${Math.round(r.left)}–${Math.round(r.right)} px su ${vw}): <${el.tagName.toLowerCase()} class="${cls}"> «${text}»`,
        );
        if (out.length >= 5) return out;
      }
    }
    return out;
  }, vw);
}

/** Esito di un controllo di funzionamento (non axe): OK/KO nel log e nel riepilogo. */
function check(label, ok, detail = "") {
  results.push({
    label,
    status: ok ? 200 : 500,
    landed: "",
    violations: [],
    skipLink: null,
    errors: ok ? [] : [detail || "controllo non superato"],
  });
  console.log(`${ok ? "OK" : "KO"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
}

/** Testo dell'avviso del modulo e se resta dentro la card (niente testo che esce di lato). */
async function formAlert(page) {
  const alert = page.locator('form [role="alert"], form [role="status"]').first();
  await alert.waitFor({ timeout: 15000 });
  const text = (await alert.innerText()).trim();
  const inside = await alert.evaluate((el) => {
    const card = el.closest(".rounded-\\[var\\(--radius-card\\)\\]") ?? el.closest("form");
    const a = el.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    return a.right <= c.right + 1 && el.scrollWidth <= el.clientWidth + 1;
  });
  return { text, inside };
}

/**
 * Flussi di accesso da utente vero, da telefono (375 px):
 * - accesso con password sbagliata: l'email resta scritta;
 * - attivazione da link di invito: password solo numeri, password diverse, nome che
 *   resta compilato, nome salvato nel profilo;
 * - uscita: si torna all'accesso e le pagine non si aprono più.
 * L'utente invitato (`verifica-invito-…@example.com`) viene sempre cancellato.
 */
async function authFlows(browser, account, matchPath) {
  await removeLeftoverTestUsers();
  // 1. Accesso con password sbagliata.
  {
    const context = await browser.newContext({
      locale: "it-IT",
      viewport: { width: 375, height: 812 },
    });
    await skipTour(context);
    const page = await context.newPage();
    await page.goto(`${appUrl}/login`);
    await page.fill("#email", account.email);
    await page.fill("#password", "password-sbagliata-1");
    await page.click('form:has(#password) button[type="submit"]');
    const { text, inside } = await formAlert(page);
    const email = await page.inputValue("#email");
    check(
      "accesso: con la password sbagliata l'email resta scritta",
      email === account.email,
      `email "${email}"`,
    );
    check("accesso: avviso di credenziali errate dentro la card", inside && text.length > 0, text);
    await context.close();
  }

  // 2. Attivazione da invito.
  const inviteEmail = `verifica-invito-${run}@example.com`;
  let invitedId = null;
  let invitationId = null;
  try {
    const { data: invitation, error: invError } = await admin
      .from("invitations")
      .insert({ email: inviteEmail, role: "USER", invited_by: null })
      .select("id")
      .single();
    if (invError) throw new Error(`Invito: ${invError.message}`);
    invitationId = invitation.id;
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "invite",
      email: inviteEmail,
    });
    if (linkError || !link.properties?.hashed_token) throw new Error(`Link: ${linkError?.message}`);
    invitedId = link.user?.id ?? null;
    await admin
      .from("invitations")
      .update({ sent_at: new Date().toISOString(), auth_user_id: invitedId })
      .eq("id", invitationId);

    const confirm = new URL("/auth/confirm", appUrl);
    confirm.searchParams.set("token_hash", link.properties.hashed_token);
    confirm.searchParams.set("type", "invite");
    confirm.searchParams.set("next", "/accept-invite");

    const context = await browser.newContext({
      locale: "it-IT",
      viewport: { width: 375, height: 812 },
    });

    await skipTour(context);
    const page = await context.newPage();
    // La pagina di conferma non consuma il link finché non si preme il bottone.
    await page.goto(confirm.toString());
    await Promise.all([
      page.waitForURL(/\/accept-invite/),
      page.click('main form button[type="submit"]'),
    ]);
    const submit = () => page.click('form:has(#displayName) button[type="submit"]');

    // 2a. Solo numeri: rifiutata con un avviso breve, il nome resta.
    await page.fill("#displayName", "DEMO Verifica");
    await page.fill("#password", "123456789012");
    await page.fill("#confirm", "123456789012");
    const letterCheck = await page
      .locator("#password-checks li", { hasText: "lettera" })
      .getAttribute("class");
    check(
      "attivazione: il requisito «lettera» resta da spuntare con soli numeri",
      !letterCheck?.includes("positive"),
      letterCheck ?? "",
    );
    await submit();
    let alert = await formAlert(page);
    check(
      "attivazione: password di soli numeri rifiutata con avviso breve",
      /lettera e un numero/.test(alert.text),
      alert.text,
    );
    check("attivazione: avviso dentro la card", alert.inside, alert.text);
    check(
      "attivazione: il nome resta compilato dopo l'errore",
      (await page.inputValue("#displayName")) === "DEMO Verifica",
    );

    // 2b. Password diverse: il requisito non si spunta e il server la rifiuta.
    await page.fill("#password", "passwordsicura9X");
    await page.fill("#confirm", "passwordsicura9Y");
    const matchCheck = await page
      .locator("#password-checks li", { hasText: "coincidono" })
      .getAttribute("class");
    check(
      "attivazione: «Le due password coincidono» non spuntato se diverse",
      !matchCheck?.includes("positive"),
      matchCheck ?? "",
    );
    await submit();
    await page
      .waitForFunction(
        () => /coincidono/.test(document.querySelector("form [role=alert]")?.textContent ?? ""),
        null,
        { timeout: 15000 },
      )
      .catch(() => null);
    alert = await formAlert(page);
    check("attivazione: password diverse rifiutate", /non coincidono/.test(alert.text), alert.text);

    // 2c. Tutto giusto: account attivo e nome salvato.
    await page.fill("#confirm", "passwordsicura9X");
    await Promise.all([page.waitForURL(/\/settings\/security/, { timeout: 20000 }), submit()]);
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", invitedId)
      .single();
    check(
      "attivazione: nome visualizzato salvato nel profilo",
      profile?.display_name === "DEMO Verifica",
      `"${profile?.display_name}"`,
    );
    await page.goto(`${appUrl}/dashboard`);
    const welcome = await page.locator("h1").first().innerText();
    check(
      "attivazione: la Home saluta con il nome scelto",
      welcome.includes("DEMO Verifica"),
      welcome,
    );

    // Un utente normale non vede i dettagli tecnici della partita (fonte, ID, qualità).
    if (matchPath) {
      await page.goto(`${appUrl}${matchPath}`);
      const technical = await page.getByText("Dettagli tecnici").count();
      check("utente: nessun dettaglio tecnico nella partita", technical === 0, `${technical}`);
    }

    // 3. Uscita dal Profilo.
    await page.goto(`${appUrl}/settings`);
    await Promise.all([
      page.waitForURL(/\/login/, { timeout: 15000 }),
      page.locator('main form[action="/auth/signout"] button[type="submit"]').click(),
    ]);
    check(
      "uscita: dal Profilo si torna alla pagina di accesso",
      new URL(page.url()).pathname === "/login",
      page.url(),
    );
    await page.goto(`${appUrl}/dashboard`);
    check(
      "uscita: dopo l'uscita le pagine chiedono di nuovo l'accesso",
      new URL(page.url()).pathname === "/login",
      page.url(),
    );
    await context.close();
  } catch (e) {
    check("flussi di accesso", false, e instanceof Error ? e.message : String(e));
  } finally {
    if (invitationId) await admin.from("invitations").delete().eq("id", invitationId);
    if (invitedId) {
      const { error } = await admin.auth.admin.deleteUser(invitedId);
      check("utente di prova dell'invito cancellato", !error, error?.message ?? "");
    }
  }
}

/**
 * Utenti di prova rimasti dalle verifiche precedenti (`verifica-invito-…@example.com`):
 * prima del 17/11/2026 l'audit impediva di cancellarli. Si tolgono all'inizio.
 */
async function removeLeftoverTestUsers() {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return;
    for (const u of data.users) {
      if (!/^verifica-invito-[0-9a-f]+@example\.com$/.test(u.email ?? "")) continue;
      await admin.from("invitations").delete().eq("email", u.email);
      await admin.auth.admin.deleteUser(u.id);
    }
    if (data.users.length < 200) return;
  }
}

/**
 * Il tutorial si apre alla prima entrata e prende il focus: per le prove automatiche si
 * segna come già visto (cookie `predictra-tour`, come dopo «Salta»).
 */
async function skipTour(context) {
  await context.addCookies([{ name: "predictra-tour", value: "done", url: appUrl }]);
}

async function login(page, account) {
  await page.goto(`${appUrl}/login`);
  await page.fill("#email", account.email);
  await page.fill("#password", account.password);
  await Promise.all([
    page.waitForURL(/\/(mfa|dashboard)/),
    page.click('form:has(#password) button[type="submit"]'),
  ]);
  if (new URL(page.url()).pathname.startsWith("/mfa")) {
    await audit(page, "/mfa");
    const next = await freshCode(account.totpSecret, account.lastCounter);
    account.lastCounter = next.counter;
    // Sei caselle: il codice scritto nella prima si distribuisce e il modulo parte da solo.
    await page.fill("#code", next.code);
    await page.waitForURL(/\/dashboard/);
  }
}

/** Primo link verso una pagina di dettaglio (partita, proposta), se c'è. */
async function firstDetailLink(page, listPath, pattern) {
  await page.goto(`${appUrl}${listPath}`, { waitUntil: "networkidle" });
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  return hrefs.find((h) => h && pattern.test(h)) ?? null;
}

function summary() {
  const lines = [
    "### Audit di accessibilità (axe, WCAG 2.1 AA) ed errori di funzionamento",
    "",
    "| Pagina | Esito |",
    "| --- | --- |",
  ];
  for (const r of results) {
    const problems = [
      ...r.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`),
      ...(r.skipLink === false ? ["link «Vai al contenuto» non raggiunto"] : []),
      ...(r.status >= 400 ? [`HTTP ${r.status}`] : []),
      ...(r.errors ?? []),
    ];
    lines.push(`| \`${r.label}\` | ${problems.length ? `❌ ${problems.join(", ")}` : "✅"} |`);
  }
  return lines.join("\n");
}

async function main() {
  const browser = await chromium.launch();
  let account = null;
  try {
    const context = await browser.newContext({ locale: "it-IT" });
    await skipTour(context);
    const page = await context.newPage();
    watchRuntime(page);
    await audit(page, "/login");
    await audit(page, "/forgot-password");

    account = await createSuperAdmin();
    await login(page, account);

    for (const path of PAGES) await audit(page, path);

    const match = await firstDetailLink(page, "/match-center", /^\/match-center\/[^/?#]+$/);
    if (match) await audit(page, match, "/match-center/[id]");
    const proposal = await firstDetailLink(page, "/bet-builder", /^\/bet-builder\/\d+$/);
    if (proposal) await audit(page, proposal, "/bet-builder/[id]");
    const slip = await firstDetailLink(page, "/bet-builder/slips", /^\/bet-builder\/slips\/\d+$/);
    if (slip) await audit(page, slip, "/bet-builder/slips/[id]");
    // La classifica di Campionati ha sempre i link alle squadre (Squadre mostra solo le seguite).
    const team = await firstDetailLink(page, "/leagues", /^\/teams\/\d+$/);
    if (team) await audit(page, team, "/teams/[id]");

    // Larghezza mobile: menu chiuso fuori dalla tabulazione, menu aperto accessibile.
    await page.setViewportSize({ width: 375, height: 812 });
    // Tutte le pagine anche da telefono: accessibilità e niente che esca dallo schermo.
    for (const path of PAGES.filter((p) => p !== "/dashboard")) {
      await audit(page, path, `${path} (mobile)`);
    }
    if (match) await audit(page, match, "/match-center/[id] (mobile)");
    if (slip) await audit(page, slip, "/bet-builder/slips/[id] (mobile)");
    if (team) await audit(page, team, "/teams/[id] (mobile)");
    await audit(page, "/dashboard", "/dashboard (mobile)");
    await page.click('button[aria-controls="sidebar"]');
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    results.push({
      label: "menu mobile aperto",
      status: 200,
      landed: "",
      violations,
      skipLink: null,
    });
    console.log(`${violations.length ? "KO" : "OK"} menu mobile aperto`);
    for (const v of violations) console.log(`   - [${v.impact}] ${v.id}: ${v.help}`);
    await page.keyboard.press("Escape");
    const closed = await page.getAttribute('button[aria-controls="sidebar"]', "aria-expanded");
    const escOk = closed === "false";
    results.push({
      label: "menu mobile: Esc chiude",
      status: escOk ? 200 : 500,
      landed: "",
      violations: [],
      skipLink: null,
    });
    console.log(`${escOk ? "OK" : "KO"} menu mobile: Esc chiude`);

    // Costruisci: una giocata scelta compare nella barra in basso, sempre visibile sopra
    // la barra di navigazione, e una seconda giocata della stessa partita sostituisce la prima.
    await page.goto(`${appUrl}/bet-builder/builder`);
    const choices = page.locator("main button[aria-pressed]");
    if ((await choices.count()) >= 2) {
      await choices.nth(0).click();
      await page.waitForURL(/[?&]s=/, { timeout: 15000 }).catch(() => null);
      const bar = page.locator('main a[href="#valutazione"]');
      const box = await bar.boundingBox();
      const nav = await page.locator('nav[aria-label="Pagine principali"]').boundingBox();
      check(
        "costruisci: «Valuta» sempre visibile sopra la barra in basso",
        box !== null && nav !== null && box.y + box.height <= nav.y && box.y > 0,
        JSON.stringify({ box, nav }),
      );
      await choices.nth(1).click();
      await page.waitForTimeout(500);
      check(
        "costruisci: una sola giocata per partita",
        (await page.locator('main button[aria-pressed="true"]').count()) === 1,
      );
    }

    // Indirizzi in inglese: i vecchi indirizzi in italiano portano ai nuovi.
    for (const [from, to] of [
      ["/certezze", "/certainties"],
      ["/affidabilita", "/reliability"],
    ]) {
      await page.goto(`${appUrl}${from}`);
      check(`indirizzi: ${from} porta a ${to}`, new URL(page.url()).pathname === to, page.url());
    }

    // Azioni di amministrazione in una finestra modale: si apre, sta nello schermo, Esc la
    // chiude. Prova con un invito temporaneo, revocabile da chiunque gestisca gli inviti.
    const { data: tempInvite } = await admin
      .from("invitations")
      .insert({ email: `verifica-finestra-${run}@example.com`, role: "USER", invited_by: null })
      .select("id")
      .single();
    try {
      await page.goto(`${appUrl}/admin/invitations`);
      await page.getByRole("button", { name: "Revoca" }).first().click();
      const box = await page
        .locator("dialog[open]")
        .boundingBox({ timeout: 5000 })
        .catch(() => null);
      check(
        "amministrazione: «Revoca» apre una finestra dentro lo schermo",
        box !== null && box.x >= 0 && box.x + box.width <= 375,
        JSON.stringify(box),
      );
      await page.keyboard.press("Escape");
      check(
        "amministrazione: Esc chiude la finestra",
        (await page.locator("dialog[open]").count()) === 0,
      );
    } catch (e) {
      check("amministrazione: finestra", false, e instanceof Error ? e.message : String(e));
    } finally {
      if (tempInvite) await admin.from("invitations").delete().eq("id", tempInvite.id);
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await authFlows(browser, account, match);
  } finally {
    await browser.close();
    if (account) {
      const { error } = await admin.auth.admin.deleteUser(account.id);
      console.log(
        error ? `KO cancellazione account: ${error.message}` : "OK account temporaneo cancellato",
      );
    }
  }

  const text = summary();
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  const failed = results.filter(
    (r) => r.violations.length > 0 || r.skipLink === false || r.status >= 400 || r.errors?.length,
  );
  console.log(`\n${results.length - failed.length}/${results.length} controlli superati.`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
