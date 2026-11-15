import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PREDICTRA non invia email: i link di invito e di reimpostazione password
 * vengono generati qui (Auth Admin API `generateLink`, che non invia nulla) e
 * consegnati a mano dall'amministratore con un canale esterno.
 *
 * Il link punta a /auth/confirm, che verifica il token lato server.
 * Il link NON viene salvato: va trattato come una password temporanea.
 * Scade secondo `auth.email.otp_expiry` (supabase/config.toml).
 */
type LinkType = "invite" | "recovery";

const NEXT_BY_TYPE: Record<LinkType, string> = {
  invite: "/accept-invite",
  recovery: "/reset-password",
};

export interface GeneratedLink {
  url: string;
  userId: string | null;
}

export function buildConfirmUrl(baseUrl: string, type: LinkType, tokenHash: string): string {
  const url = new URL("/auth/confirm", baseUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", NEXT_BY_TYPE[type]);
  return url.toString();
}

export async function generateAuthLink(type: LinkType, email: string): Promise<GeneratedLink> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error || !data.properties?.hashed_token) {
    throw new Error(error?.message ?? "Generazione link non riuscita");
  }
  return {
    url: buildConfirmUrl(serverEnv().APP_BASE_URL, type, data.properties.hashed_token),
    userId: data.user?.id ?? null,
  };
}
