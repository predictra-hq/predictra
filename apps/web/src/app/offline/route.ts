import { getMessages } from "@/lib/i18n";
import { OFFLINE_CSP, offlinePageHtml } from "@/lib/offline";

/**
 * Schermata «Sei offline» (ADR 0057): la scarica il service worker quando si installa.
 * Pubblica e senza dati: il proxy non la tocca (vedi `proxy.ts`).
 */
export const dynamic = "force-static";

export function GET() {
  const m = getMessages();
  const html = offlinePageHtml({
    appName: m.app.name,
    title: m.offline.title,
    text: m.offline.text,
    retry: m.offline.retry,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": OFFLINE_CSP,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
