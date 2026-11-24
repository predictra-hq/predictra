import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

type ServerClient = Awaited<ReturnType<typeof userClient>>;

/**
 * Client di servizio per un tratto di codice senza utente (ADR 0070): l'avvio programmato
 * dell'agente (firma QStash già verificata) che salva le schedine, o l'analisi dei dati.
 * Dentro `withServiceClient` le stesse letture delle pagine usano questo client.
 */
const serviceScope = new AsyncLocalStorage<ServerClient>();

export function withServiceClient<T>(client: unknown, fn: () => Promise<T>): Promise<T> {
  return serviceScope.run(client as ServerClient, fn);
}

/** Client Supabase per Server Components, Server Actions e Route Handlers (sessione utente, RLS attiva). */
export async function createClient(): Promise<ServerClient> {
  return serviceScope.getStore() ?? userClient();
}

async function userClient() {
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet)
              cookieStore.set(name, value, options);
          } catch {
            // Chiamato da un Server Component: i cookie non sono scrivibili.
            // Il refresh della sessione avviene comunque nel proxy.
          }
        },
      },
    },
  );
}
