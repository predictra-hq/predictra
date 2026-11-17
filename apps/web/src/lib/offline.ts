/**
 * Schermata «Sei offline» (ADR 0059). Il service worker (`public/sw.js`) la conserva
 * all'installazione e la mostra quando una pagina non si carica per mancanza di rete.
 *
 * È una pagina autosufficiente: stili e simbolo sono dentro l'HTML, perché offline non
 * si può scaricare nient'altro. Nessuno script: «Riprova» è un collegamento alla pagina
 * stessa (`href=""`), che il browser ricarica.
 */

/** Indirizzo della schermata: lo stesso in `public/sw.js`. */
export const OFFLINE_PATH = "/offline";

/** CSP della schermata: nessuno script, solo stili interni. */
export const OFFLINE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export interface OfflineTexts {
  appName: string;
  title: string;
  text: string;
  retry: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Colori del tema scuro (predefinito), gli stessi di `app/globals.css`. */
export function offlinePageHtml(texts: OfflineTexts): string {
  const t = {
    appName: escapeHtml(texts.appName),
    title: escapeHtml(texts.title),
    text: escapeHtml(texts.text),
    retry: escapeHtml(texts.retry),
  };
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0b0d">
<meta name="robots" content="noindex">
<title>${t.title} · ${t.appName}</title>
<style>
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:flex;align-items:center;justify-content:center;padding:24px;background:#0a0b0d;color:#f4f4f5;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}
main{max-width:22rem}
svg{width:64px;height:64px}
h1{margin:20px 0 8px;font-size:1.375rem}
p{margin:0 0 24px;color:#a1a1aa;line-height:1.5}
a{display:inline-block;padding:12px 24px;border-radius:12px;background:#10b981;color:#04120c;font-weight:600;text-decoration:none}
.name{margin-top:32px;font-size:.75rem;letter-spacing:.1em;color:#71717a}
</style>
</head>
<body>
<main>
<svg viewBox="0 0 32 32" aria-hidden="true">
<rect width="32" height="32" rx="7" fill="#16181d"/>
<polyline points="6,23 12,16.5 17,20 23.5,11" fill="none" stroke="#10b981" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="24.5" cy="9.5" r="3.4" fill="#f4f4f5"/>
</svg>
<h1>${t.title}</h1>
<p>${t.text}</p>
<a href="">${t.retry}</a>
<div class="name">${t.appName}</div>
</main>
</body>
</html>
`;
}
