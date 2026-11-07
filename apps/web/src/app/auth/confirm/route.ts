import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation";

/** Tipi di link email accettati. La registrazione pubblica non esiste. */
const ALLOWED_TYPES: readonly EmailOtpType[] = ["invite", "recovery", "email_change", "email"];

/** Destinazione predefinita per tipo di link. */
const DEFAULT_NEXT: Partial<Record<EmailOtpType, string>> = {
  invite: "/accept-invite",
  recovery: "/reset-password",
};

/**
 * Verifica i link inviati per email (invito, recupero password, cambio email)
 * con il flusso token_hash, lato server. I link sono generati da lib/auth/links.ts
 * (nessuna email: vengono consegnati a mano, vedi ADR 0008).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const fallback = (type && DEFAULT_NEXT[type]) || "/dashboard";
  const next = safeNextPath(searchParams.get("next"), fallback);

  const target = request.nextUrl.clone();
  target.search = "";

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      target.pathname = next;
      return NextResponse.redirect(target);
    }
  }

  target.pathname = "/login";
  target.searchParams.set("error", "link");
  return NextResponse.redirect(target);
}
