import "server-only";
import type {
  BankrollSummaryRow,
  BetRow,
  MovementKind,
  PersonalLimitsRow,
} from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";

/*
 * Letture dei dati personali con la sessione dell'utente: la RLS restituisce solo
 * i dati del proprietario (ADR 0030). Le pagine chiamano prima `requireUser()`.
 */

export class BankrollUnavailable extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Lettura non riuscita: ${what}`, { cause });
  }
}

export interface MovementRow {
  id: number;
  bankroll_id: number;
  kind: MovementKind;
  amount: number;
  occurred_at: string;
  note: string | null;
}

export async function listBankrolls(): Promise<BankrollSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_bankroll_summary")
    .select("*")
    .order("kind")
    .order("name");
  if (error) throw new BankrollUnavailable("bankroll", error);
  return (data ?? []) as BankrollSummaryRow[];
}

export async function listMovements(bankrollId?: number): Promise<MovementRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("bankroll_movements")
    .select("id, bankroll_id, kind, amount, occurred_at, note")
    .order("occurred_at", { ascending: false })
    .limit(1000);
  if (bankrollId !== undefined) query = query.eq("bankroll_id", bankrollId);
  const { data, error } = await query;
  if (error) throw new BankrollUnavailable("movimenti", error);
  return (data ?? []) as MovementRow[];
}

export async function listLimits(): Promise<PersonalLimitsRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("personal_limits").select("*");
  if (error) throw new BankrollUnavailable("limiti", error);
  return (data ?? []) as PersonalLimitsRow[];
}

/** Giocate dell'utente; con `sinceDays` solo quelle registrate negli ultimi giorni. */
export async function listBets(sinceDays?: number): Promise<BetRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("v_bets")
    .select("*")
    .order("placed_at", { ascending: false })
    .limit(1000);
  if (sinceDays !== undefined) {
    query = query.gte("placed_at", new Date(Date.now() - sinceDays * 86_400_000).toISOString());
  }
  const { data, error } = await query;
  if (error) throw new BankrollUnavailable("giocate", error);
  return (data ?? []) as BetRow[];
}
