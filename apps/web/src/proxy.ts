import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// /api/jobs/* non ha sessione: lo chiama QStash e l'autorizzazione è la sua firma
// (src/lib/agent/qstash.ts), verificata dalla route prima di ogni accesso al database.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/jobs/|favicon.ico|robots.txt|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
