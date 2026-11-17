import type { NextRequest } from "next/server";
import { buildCsp, generateNonce, supabaseOrigins } from "@/lib/csp";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Nonce nuovo a ogni richiesta: Next.js lo legge dall'header della richiesta e lo
  // applica agli script del rendering (docs/operations/security.md).
  const nonce = generateNonce();
  const csp = buildCsp(nonce, {
    isDev: process.env.NODE_ENV === "development",
    connect: supabaseOrigins(process.env.NEXT_PUBLIC_SUPABASE_URL),
  });
  const response = await updateSession(request, {
    "x-nonce": nonce,
    "Content-Security-Policy": csp,
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Il manifest dell'app, il service worker e la schermata offline non contengono dati: il
// browser li scarica senza sessione (ADR 0057).
// /api/jobs/* non ha sessione: lo chiama QStash e l'autorizzazione è la sua firma
// (src/lib/agent/qstash.ts), verificata dalla route prima di ogni accesso al database.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/jobs/|favicon.ico|robots.txt|manifest.webmanifest|sw\.js|offline$|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
