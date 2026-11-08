import "server-only";
import { sortCompetitions } from "@/lib/football/format";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeTeamName,
  parseUnmatchedIssue,
  type AliasRow,
  type UnmatchedEvent,
} from "./aliases";
import { ODDS_PROVIDER, OddsDataUnavailable } from "./queries";

/*
 * Letture della pagina admin degli alias. Tutte con la sessione dell'utente
 * (RLS: lettura per utenti attivi); la scrittura passa solo da `add_team_alias`.
 */

export async function listUnmatchedEvents(): Promise<UnmatchedEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_quality_issues")
    .select("id, provider_entity_id, details, last_seen_at")
    .eq("status", "OPEN")
    .eq("check_code", "odds.event_unmatched")
    .eq("provider", ODDS_PROVIDER)
    .order("last_seen_at", { ascending: false })
    .limit(500);
  if (error) throw new OddsDataUnavailable("eventi non abbinati", error);
  return (data ?? [])
    .map((row) =>
      parseUnmatchedIssue({
        id: Number(row.id),
        provider_entity_id: (row.provider_entity_id as string | null) ?? null,
        details: row.details,
        last_seen_at: String(row.last_seen_at),
      }),
    )
    .filter((e): e is UnmatchedEvent => e !== null);
}

/** Alias esistenti (di qualsiasi fonte) per i nomi indicati. */
export async function listAliasesFor(names: readonly string[]): Promise<AliasRow[]> {
  const normalized = [...new Set(names.map(normalizeTeamName))];
  if (normalized.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_aliases")
    .select("team_id, normalized_alias")
    .in("normalized_alias", normalized);
  if (error) throw new OddsDataUnavailable("alias", error);
  return (data ?? []).map((r) => ({
    team_id: Number(r.team_id),
    normalized_alias: String(r.normalized_alias),
  }));
}

export interface TeamOption {
  id: number;
  name: string;
  short_name: string | null;
}

export interface CompetitionTeams {
  code: string | null;
  name: string;
  teams: TeamOption[];
}

/**
 * Squadre raggruppate per competizione (dall'ultima classifica di ogni
 * stagione), più quelle non presenti in nessuna classifica.
 */
export async function listTeamsByCompetition(): Promise<{
  groups: CompetitionTeams[];
  others: TeamOption[];
}> {
  const supabase = await createClient();
  const [teamsRes, standingsRes, competitionsRes] = await Promise.all([
    supabase.from("teams").select("id, name, short_name").order("name").limit(1000),
    supabase
      .from("v_latest_standings")
      .select("competition_id, team_id")
      .eq("standing_type", "TOTAL")
      .limit(1000),
    supabase.from("competitions").select("id, code, name"),
  ]);
  const failed = teamsRes.error ?? standingsRes.error ?? competitionsRes.error;
  if (failed) throw new OddsDataUnavailable("squadre", failed);

  const all: TeamOption[] = (teamsRes.data ?? []).map((t) => ({
    id: Number(t.id),
    name: String(t.name),
    short_name: (t.short_name as string | null) ?? null,
  }));
  const byId = new Map(all.map((t) => [t.id, t]));
  const teamIdsByCompetition = new Map<number, Set<number>>();
  for (const s of standingsRes.data ?? []) {
    const set = teamIdsByCompetition.get(Number(s.competition_id)) ?? new Set<number>();
    set.add(Number(s.team_id));
    teamIdsByCompetition.set(Number(s.competition_id), set);
  }
  const placed = new Set<number>();
  const groups = sortCompetitions(
    (competitionsRes.data ?? []).map((c) => ({
      code: (c.code as string | null) ?? null,
      name: String(c.name),
      teams: [...(teamIdsByCompetition.get(Number(c.id)) ?? [])]
        .map((id) => byId.get(id))
        .filter((t): t is TeamOption => t !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name, "it")),
    })),
  ).filter((g) => g.teams.length > 0);
  for (const g of groups) for (const t of g.teams) placed.add(t.id);
  return { groups, others: all.filter((t) => !placed.has(t.id)) };
}

export interface ManualAlias {
  id: number;
  alias: string;
  teamName: string;
  createdAt: string;
}

export async function listManualAliases(): Promise<ManualAlias[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_aliases")
    .select("id, alias, created_at, team:teams!team_aliases_team_id_fkey(name)")
    .eq("source", "manual")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new OddsDataUnavailable("alias manuali", error);
  type Raw = { id: number; alias: string; created_at: string; team: { name: string } | null };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: Number(r.id),
    alias: r.alias,
    teamName: r.team?.name ?? "—",
    createdAt: r.created_at,
  }));
}
