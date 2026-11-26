"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { parseLegs } from "@/lib/bankroll/legs";
import { betSchema, settleSchema, toIsoDate } from "@/lib/bankroll/validation";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@predictra/shared-types";

/*
 * Giocate registrate a mano dall'utente (PREDICTRA non piazza scommesse).
 * Limiti personali, incasso e isolamento li applica il database (ADR 0030):
 * un limite superato arriva come errore 23514 con un messaggio già leggibile.
 */

const done = (message: string): ActionState => {
  revalidatePath("/tracker");
  revalidatePath("/bankroll");
  return { ok: true, message };
};

export async function addBet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().bankroll;
  const t = getMessages().tracker;
  await requireUser();
  const parsed = betSchema.safeParse({
    bankrollId: formData.get("bankrollId"),
    description: formData.get("description"),
    market: formData.get("market"),
    selection: formData.get("selection"),
    line: formData.get("line"),
    odds: formData.get("odds"),
    stake: formData.get("stake"),
    bookmaker: formData.get("bookmaker"),
    placedAt: formData.get("placedAt"),
    closingOdds: formData.get("closingOdds"),
    legs: formData.get("legs"),
  });
  if (!parsed.success) return { ok: false, message: m.invalid };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("bets").insert({
    // Selezioni valide: la giocata si chiuderà da sola a partite finite.
    legs: parseLegs(d.legs) as unknown as Json,
    bankroll_id: d.bankrollId,
    description: d.description,
    market: d.market,
    selection: d.selection,
    line: d.line ?? null,
    odds: d.odds,
    stake: d.stake,
    bookmaker: d.bookmaker ?? null,
    closing_odds: d.closingOdds ?? null,
    ...(toIsoDate(d.placedAt) ? { placed_at: toIsoDate(d.placedAt) } : {}),
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  return done(t.betSaved);
}

export async function settleBet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().bankroll;
  const t = getMessages().tracker;
  await requireUser();
  const parsed = settleSchema.safeParse({
    betId: formData.get("betId"),
    status: formData.get("status"),
    payout: formData.get("payout"),
    closingOdds: formData.get("closingOdds"),
  });
  if (!parsed.success) return { ok: false, message: m.invalid };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("bets")
    .update({
      status: d.status,
      // L'incasso lo calcola il database, salvo il cash out.
      payout: d.status === "CASHED_OUT" ? d.payout : null,
      ...(d.closingOdds !== undefined ? { closing_odds: d.closingOdds } : {}),
    })
    .eq("id", d.betId);
  if (error) return { ok: false, message: toUserMessage(error) };
  return done(t.settled);
}

export async function deleteBet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().bankroll;
  const t = getMessages().tracker;
  await requireUser();
  const id = Number(formData.get("betId"));
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: m.invalid };
  const supabase = await createClient();
  const { error } = await supabase.from("bets").delete().eq("id", id);
  if (error) return { ok: false, message: toUserMessage(error) };
  return done(t.betDeleted);
}
