"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import {
  bankrollSchema,
  bookmakerSchema,
  limitsSchema,
  movementSchema,
  toIsoDate,
} from "@/lib/bankroll/validation";
import { splitSiteChoice } from "@/lib/bankroll/sites";
import { toUserMessage, type ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/*
 * Scritture sul bankroll con la sessione dell'utente: la RLS (solo proprietario)
 * e i vincoli del database restano l'unica garanzia (ADR 0030).
 */

const done = (message: string): ActionState => {
  revalidatePath("/accounts");
  revalidatePath("/tracker");
  return { ok: true, message };
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Sito del bankroll dal modulo: un bookmaker raccolto (il nome viene dalla tabella, non
 * dal modulo) oppure un nome scritto a mano. `null` se manca o non è valido.
 */
async function readBookmaker(
  supabase: Supabase,
  formData: FormData,
): Promise<{ bookmaker_code: string | null; bookmaker_name: string } | null> {
  const parsed = bookmakerSchema.safeParse(
    splitSiteChoice(formData.get("bookmakerCode"), formData.get("bookmakerName")),
  );
  if (!parsed.success) return null;
  if (parsed.data.bookmakerCode) {
    const { data } = await supabase
      .from("bookmakers")
      .select("code, title")
      .eq("code", parsed.data.bookmakerCode)
      .eq("italian_market", true)
      .maybeSingle();
    return data ? { bookmaker_code: String(data.code), bookmaker_name: String(data.title) } : null;
  }
  return { bookmaker_code: null, bookmaker_name: parsed.data.bookmakerName! };
}

export async function setBookmaker(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().bankroll;
  await requireUser();
  const id = Number(formData.get("bankrollId"));
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: m.invalid };
  const supabase = await createClient();
  const bookmaker = await readBookmaker(supabase, formData);
  if (!bookmaker) return { ok: false, message: m.bookmakerRequired };
  const { error } = await supabase.from("bankrolls").update(bookmaker).eq("id", id);
  if (error) return { ok: false, message: toUserMessage(error) };
  revalidatePath("/bet-builder");
  revalidatePath("/certainties");
  return done(m.bookmakerSaved);
}

export async function createBankroll(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().bankroll;
  await requireUser();
  const parsed = bankrollSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    flatPct: formData.get("flatPct"),
  });
  if (!parsed.success) return { ok: false, message: m.invalid };
  const supabase = await createClient();
  // Il sito è obbligatorio: serve a proporre le quote giuste su schedine e giocate.
  const bookmaker = await readBookmaker(supabase, formData);
  if (!bookmaker) return { ok: false, message: m.bookmakerRequired };
  const { error } = await supabase.from("bankrolls").insert({
    name: parsed.data.name,
    kind: parsed.data.kind,
    flat_stake_pct: parsed.data.flatPct,
    ...bookmaker,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, message: m.nameTaken };
    return { ok: false, message: toUserMessage(error) };
  }
  return done(m.created);
}

export async function deleteBankroll(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().bankroll;
  await requireUser();
  const id = Number(formData.get("bankrollId"));
  if (!Number.isSafeInteger(id) || id <= 0 || formData.get("confirm") !== "on") {
    return { ok: false, message: m.invalid };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("bankrolls").delete().eq("id", id);
  if (error) return { ok: false, message: toUserMessage(error) };
  return done(m.deleted);
}

export async function addMovement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().bankroll;
  await requireUser();
  const parsed = movementSchema.safeParse({
    bankrollId: formData.get("bankrollId"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    occurredAt: formData.get("occurredAt"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, message: m.invalid };
  const supabase = await createClient();
  const { error } = await supabase.from("bankroll_movements").insert({
    bankroll_id: parsed.data.bankrollId,
    kind: parsed.data.kind,
    amount: parsed.data.amount,
    note: parsed.data.note ?? null,
    ...(toIsoDate(parsed.data.occurredAt)
      ? { occurred_at: toIsoDate(parsed.data.occurredAt) }
      : {}),
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  return done(m.movementSaved);
}

export async function deleteMovement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().bankroll;
  await requireUser();
  const id = Number(formData.get("movementId"));
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: m.invalid };
  const supabase = await createClient();
  const { error } = await supabase.from("bankroll_movements").delete().eq("id", id);
  if (error) return { ok: false, message: toUserMessage(error) };
  return done(m.movementDeleted);
}

export async function saveLimits(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages().bankroll;
  await requireUser();
  const parsed = limitsSchema.safeParse({
    bankrollId: formData.get("bankrollId"),
    maxStake: formData.get("maxStake"),
    maxOpenBets: formData.get("maxOpenBets"),
    maxDailyLoss: formData.get("maxDailyLoss"),
    maxWeeklyLoss: formData.get("maxWeeklyLoss"),
  });
  if (!parsed.success) return { ok: false, message: m.invalid };
  const supabase = await createClient();
  const { error } = await supabase.from("personal_limits").upsert({
    bankroll_id: parsed.data.bankrollId,
    max_stake: parsed.data.maxStake ?? null,
    max_open_bets: parsed.data.maxOpenBets ?? null,
    max_daily_loss: parsed.data.maxDailyLoss ?? null,
    max_weekly_loss: parsed.data.maxWeeklyLoss ?? null,
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  return done(m.limitsSaved);
}
