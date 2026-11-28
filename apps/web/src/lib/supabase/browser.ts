"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

type BrowserClient = ReturnType<typeof createBrowserClient>;

let client: BrowserClient | null = null;

/**
 * Client Supabase nel browser, usato **solo** per ascoltare gli avvisi di Realtime dello
 * Spogliatoio (ADR 0081). Legge la sessione dai cookie e non la rinnova né la scrive: il
 * rinnovo resta al proxy, così browser e server non si contendono il token. Nessuna
 * lettura o scrittura di dati passa da qui: i dati arrivano sempre dal server.
 */
export function browserClient(): BrowserClient {
  if (client) return client;
  const env = publicEnv();
  client = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
  return client;
}
