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
 *    Tab raggiunge il link "Vai al contenuto".
 * 4. Cancella SEMPRE l'account (e a cascata i suoi dati), anche in caso di errore.
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
const SCREENSHOTS = new Set(["/dashboard", "/dashboard (mobile)", "/admin/users"]);

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const PAGES = [
  "/dashboard",
  "/match-center",
  "/data-center",
  "/markets",
  "/statistics",
  "/leagues",
  "/models",
  "/bet-builder",
  "/bet-builder/builder",
  "/bet-builder/slips",
  "/bankroll",
  "/tracker",
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

    return { id, email, password, totpSecret, lastCounter: first.counter };
  } catch (e) {
    await admin.auth.admin.deleteUser(id);
    throw e;
  }
}

// --- Controlli -----------------------------------------------------------------------

async function audit(page, path, label = path) {
  const response = await page.goto(`${appUrl}${path}`, { waitUntil: "networkidle" });
  const status = response?.status() ?? 0;
  const landed = new URL(page.url()).pathname;
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
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

  results.push({ label, status, landed, violations, skipLink });
  const marker = violations.length === 0 && skipLink !== false && status < 400 ? "OK" : "KO";
  console.log(`${marker} ${label} (${status}${landed !== path ? ` → ${landed}` : ""})`);
  for (const v of violations) {
    console.log(`   - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elementi)`);
    for (const n of v.nodes.slice(0, 3)) console.log(`       ${n.target.join(" ")}`);
  }
  if (skipLink === false) console.log("   - il primo Tab non raggiunge «Vai al contenuto»");
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
    "### Audit di accessibilità (axe, WCAG 2.1 AA)",
    "",
    "| Pagina | Esito |",
    "| --- | --- |",
  ];
  for (const r of results) {
    const problems = [
      ...r.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`),
      ...(r.skipLink === false ? ["link «Vai al contenuto» non raggiunto"] : []),
      ...(r.status >= 400 ? [`HTTP ${r.status}`] : []),
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
    await audit(page, "/login");
    await audit(page, "/forgot-password");

    account = await createSuperAdmin();
    await login(page, account);

    for (const path of PAGES) await audit(page, path);

    const match = await firstDetailLink(page, "/match-center", /^\/match-center\/[^/?#]+$/);
    if (match) await audit(page, match, "/match-center/[id]");
    const proposal = await firstDetailLink(page, "/bet-builder", /^\/bet-builder\/[0-9a-f-]{36}$/);
    if (proposal) await audit(page, proposal, "/bet-builder/[id]");

    // Larghezza mobile: menu chiuso fuori dalla tabulazione, menu aperto accessibile.
    await page.setViewportSize({ width: 375, height: 812 });
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
    (r) => r.violations.length > 0 || r.skipLink === false || r.status >= 400,
  );
  console.log(`\n${results.length - failed.length}/${results.length} controlli superati.`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
