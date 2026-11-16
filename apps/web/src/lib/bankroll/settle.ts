import "server-only";
import { cache } from "react";
import { inChunks } from "@/lib/chunks";
import { createClient } from "@/lib/supabase/server";
import { outcomeOfLegs, type BetLeg, type MatchOutcome } from "./legs";

/**
 * Chiude da sole le giocate aperte dell'utente che hanno le selezioni strutturate
 * (`bets.legs`) quando i risultati lo permettono. Gira con la sessione dell'utente (RLS:
 * solo le sue giocate), all'apertura di Giocate fatte, Bankroll e Home, al massimo una
 * volta per richiesta. Un errore non blocca la pagina: le giocate restano aperte.
 */
export const settleOpenBets = cache(async (): Promise<{ won: number; lost: number }> => {
  const summary = { won: 0, lost: 0 };
  try {
    const supabase = await createClient();
    const { data: open } = await supabase
      .from("bets")
      .select("id, legs")
      .eq("status", "OPEN")
      .not("legs", "is", null)
      .limit(200);
    const bets = ((open ?? []) as { id: number; legs: BetLeg[] }[]).filter((b) =>
      Array.isArray(b.legs),
    );
    if (bets.length === 0) return summary;

    const matchIds = [...new Set(bets.flatMap((b) => b.legs.map((l) => Number(l.m))))];
    const rows = await inChunks(matchIds, 100, async (ids) => {
      const { data } = await supabase
        .from("v_match_center")
        .select("match_id, status, home_score, away_score")
        .in("match_id", ids);
      return (data ?? []) as {
        match_id: number;
        status: string;
        home_score: number | null;
        away_score: number | null;
      }[];
    });
    const results = new Map<number, MatchOutcome>(
      rows.map((r) => [
        Number(r.match_id),
        { status: r.status, home: r.home_score, away: r.away_score },
      ]),
    );

    for (const bet of bets) {
      const outcome = outcomeOfLegs(bet.legs, results);
      if (!outcome) continue;
      // `eq status OPEN`: se nel frattempo l'utente l'ha chiusa a mano, vince la sua scelta.
      const { error } = await supabase
        .from("bets")
        .update({ status: outcome })
        .eq("id", bet.id)
        .eq("status", "OPEN");
      if (!error) summary[outcome === "WON" ? "won" : "lost"] += 1;
    }
  } catch {
    // Lettura o scrittura non riuscita: nessuna chiusura, si riprova alla prossima apertura.
  }
  return summary;
});
