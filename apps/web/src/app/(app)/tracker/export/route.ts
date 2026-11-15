import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { betsToCsv } from "@/lib/bankroll/csv";
import { parsePeriod } from "@/lib/bankroll/period";
import { listBets } from "@/lib/bankroll/queries";
import { getMessages } from "@/lib/i18n";

/**
 * Esporta in CSV le giocate dell'utente per il periodo scelto nel Tracker.
 * Legge con la sessione dell'utente: la RLS restituisce solo i dati del proprietario
 * (ADR 0030). Nessun dato viene salvato o inviato altrove.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const allowed =
    user !== null &&
    user.status === "ACTIVE" &&
    user.roles.length > 0 &&
    (!user.hasMfa || user.aal2);
  if (!allowed) return new NextResponse(null, { status: 401 });

  const m = getMessages();
  const period = parsePeriod(request.nextUrl.searchParams.get("p"));
  let csv: string;
  try {
    const bets = await listBets(period === "all" ? undefined : Number(period));
    csv = betsToCsv(bets, {
      columns: m.tracker.csvColumns,
      kinds: m.bankroll.kinds,
      statuses: m.tracker.statuses,
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }

  const day = new Date().toISOString().slice(0, 10);
  // BOM: i fogli di calcolo riconoscono UTF-8 e mostrano bene le lettere accentate.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="predictra-giocate-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
