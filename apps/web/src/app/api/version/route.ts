import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

/**
 * Versione pubblicata in questo momento: la pagina aperta la confronta con la propria per
 * proporre l'aggiornamento dopo un deploy. Passa dal proxy come ogni altra pagina, quindi
 * risponde solo a chi ha una sessione. Non contiene dati: solo l'identificativo del commit.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ version: APP_VERSION }, { headers: { "Cache-Control": "no-store" } });
}
