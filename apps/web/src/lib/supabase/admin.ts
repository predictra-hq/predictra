import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Client con chiave segreta (bypassa RLS). Usarlo SOLO lato server e SOLO dopo
 * che i permessi sono stati verificati (tipicamente da una RPC che ha già
 * controllato ruolo, stato e 2FA dell'attore).
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv();
  const { SUPABASE_SECRET_KEY } = serverEnv();
  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
