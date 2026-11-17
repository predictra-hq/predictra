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
  "/certezze",
  "/certezze (mobile)",
  "/match-center (mobile)",
  "/match-center/[id] (mobile)",
  "/leagues (mobile)",
  "/bet-builder (mobile)",
  "/admin/users",
]);

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const PAGES = [
  "/dashboard",
  "/certezze",
  "/match-center",
  "/data-center",
  "/markets",
  "/statistics",
  "/leagues",
  "/teams",
  "/affidabilita",
  "/models",
  "/bet-builder",
  "/bet-builder/builder",
  "/bet-builder/slips",
  "/bet-builder/results",
  "/bankroll",
  "/tracker",
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
const PRINT_TEXT = new Set(["/dashboard", "/certezze", "/match-center", "/match-center/[id]"]);

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
    await page.fill("#code", next.code);
    await Promise.all([
      page.waitForURL(/\/dashboard/),
      page.click('form:has(#code) button[type="submit"]'),
    ]);
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
