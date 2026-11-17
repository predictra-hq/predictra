import "server-only";
import type { MatchCenterRow } from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";
import { readFavoriteCompetition } from "./favorite";
import type { TeamInfo } from "./queries";

/*
 * Squadre e campionati seguiti dall'utente (tabella `user_follows`, RLS solo
 * proprietario). Letture con la sessione dell'utente: nessun amministratore le vede.
 * Sono un aiuto alla navigazione: se una lettura fallisce le pagine si vedono lo stesso,
 * senza i seguiti.
 */

export interface Follows {
  teamIds: number[];
  competitionIds: number[];
}

const NONE: Follows = { teamIds: [], competitionIds: [] };

export async function listFollows(): Promise<Follows> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_follows")
    .select("team_id, competition_id")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return NONE;
  return {
    teamIds: data.flatMap((r) => (r.team_id === null ? [] : [Number(r.team_id)])),
    competitionIds: data.flatMap((r) =>
      r.competition_id === null ? [] : [Number(r.competition_id)],
    ),
  };
}

/** Squadre seguite, in ordine alfabetico. */
export async function listFollowedTeams(teamIds: readonly number[]): Promise<TeamInfo[]> {
  if (teamIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, short_name, tla")
    .in("id", [...teamIds])
    .order("name");
  if (error) return [];
  return (data ?? []) as TeamInfo[];
}

/** Prossime partite delle squadre seguite, dalla più vicina. */
export async function listFollowedMatches(
  teamIds: readonly number[],
  now: Date,
  limit = 5,
): Promise<MatchCenterRow[]> {
  if (teamIds.length === 0) return [];
  const ids = teamIds.join(",");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_match_center")
    .select("*")
    .or(`home_team_id.in.(${ids}),away_team_id.in.(${ids})`)
    .is("home_score", null)
    .gte("kickoff_at", now.toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as MatchCenterRow[];
}

/** Codice del campionato seguito più di recente, se ce n'è uno. */
export async function latestFollowedCompetitionCode(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_follows")
    .select("competition_id")
    .not("competition_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.competition_id) return null;
  const { data: competition } = await supabase
    .from("competitions")
    .select("code")
    .eq("id", data.competition_id)
    .maybeSingle();
  return typeof competition?.code === "string" ? competition.code : null;
}

/**
 * Campionato da aprire di solito: il cookie di questo browser, altrimenti il campionato
 * seguito più di recente (che vale su tutti i dispositivi).
 */
export async function readFavoriteCompetitionAnywhere(): Promise<string | null> {
  return (await readFavoriteCompetition()) ?? (await latestFollowedCompetitionCode());
}
