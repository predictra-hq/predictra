"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { parseSelectionKeys } from "@/lib/bet-builder/evaluate";
import { listProposalLegs } from "@/lib/bet-builder/queries";
import type { ActionState } from "@/lib/errors";
import { getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/*
 * Schedine private (M5 corsia B, fase B4). Scrittura con la sessione
 * dell'utente: la RLS di `user_bet_slips` ammette solo il proprietario attivo.
 */

const nameSchema = z.string().trim().min(1).max(80);
const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

type SelectionInsert = {
  slip_id?: number;
  leg_no: number;
  match_id: number;
  market: string;
  selection: string;
  prediction_id?: number | null;
  odds_snapshot_id?: number | null;
};

async function createSlip(
  name: string,
  sourceProposalId: number | null,
  selections: Omit<SelectionInsert, "slip_id">[],
): Promise<ActionState> {
  const m = getMessages();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_bet_slips")
    .insert({ name, source_proposal_id: sourceProposalId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: m.common.genericError };
  const slipId = Number(data.id);
  const insert = await supabase
    .from("user_bet_slip_selections")
    .insert(selections.map((s) => ({ ...s, slip_id: slipId })));
  if (insert.error) {
    // Nessuna schedina a metà.
    await supabase.from("user_bet_slips").delete().eq("id", slipId);
    return { ok: false, message: m.common.genericError };
  }
  revalidatePath("/bet-builder/slips");
  return { ok: true, message: m.betBuilder.slipSaved };
}

export async function saveProposalSlip(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const m = getMessages();
  await requireUser();
  const name = nameSchema.safeParse(formData.get("name"));
  const proposalId = idSchema.safeParse(formData.get("proposalId"));
  if (!name.success || !proposalId.success) return { ok: false, message: m.common.genericError };
  const legs = await listProposalLegs([proposalId.data]);
  if (legs.length === 0) return { ok: false, message: m.common.genericError };
  return createSlip(
    name.data,
    proposalId.data,
    legs.map((l) => ({
      leg_no: l.leg_no,
      match_id: l.match_id,
      market: l.market,
      selection: l.selection,
      prediction_id: l.prediction_id,
      odds_snapshot_id: l.odds_snapshot_id,
    })),
  );
}

export async function saveManualSlip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const m = getMessages();
  await requireUser();
  const name = nameSchema.safeParse(formData.get("name"));
  const selections = parseSelectionKeys(formData.getAll("s"));
  if (!name.success || selections.length === 0) {
    return { ok: false, message: m.common.genericError };
  }
  // Solo riferimenti a partita ed esito: i valori si rileggono sempre dalle fonti.
  return createSlip(
    name.data,
    null,
    selections.map((s, i) => ({
      leg_no: i + 1,
      match_id: s.matchId,
      market: "1X2",
      selection: s.selection,
    })),
  );
}

export async function deleteSlip(formData: FormData): Promise<void> {
  await requireUser();
  const id = idSchema.safeParse(formData.get("slipId"));
  if (id.success) {
    const supabase = await createClient();
    // La RLS limita la cancellazione alle schedine dell'utente.
    await supabase.from("user_bet_slips").delete().eq("id", id.data);
  }
  revalidatePath("/bet-builder/slips");
  redirect("/bet-builder/slips");
}
