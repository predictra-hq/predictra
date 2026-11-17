/**
 * Content Security Policy con nonce (M8, docs/operations/security.md).
 *
 * Il proxy genera un nonce diverso a ogni richiesta; Next.js lo applica agli script
 * che inserisce durante il rendering dinamico. `'strict-dynamic'` permette agli script
 * autorizzati di caricare i propri moduli; nessuno script inline senza nonce viene
 * eseguito. Gli stili restano con `'unsafe-inline'` (attributi `style` di React e
 * Tailwind): un'iniezione di soli stili non esegue codice. `worker-src 'self'` permette solo
 * il service worker della schermata offline (`/sw.js`, ADR 0057).
 */

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function supabaseOrigins(url: string | undefined): string[] {
  try {
    const origin = new URL(url ?? "").origin;
    return [origin, origin.replace(/^https/, "wss")];
  } catch {
    return [];
  }
}

export function buildCsp(nonce: string, options: { isDev: boolean; connect: string[] }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    ["connect-src 'self'", ...options.connect].join(" "),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(options.isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
