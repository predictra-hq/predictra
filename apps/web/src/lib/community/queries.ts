import "server-only";
import type {
  CommunityChannel,
  CommunityPostRow,
  MatchCommentFeedRow,
  NameColor,
  NameStyle,
  RecentCommentRow,
} from "@predictra/shared-types";
import { parseSharedSlip, type SharedResult } from "@/lib/community/slip";
import { createClient } from "@/lib/supabase/server";

/**
 * Letture della comunità (ADR 0058), sempre con la sessione dell'utente: i dati altrui
 * arrivano solo dalle funzioni del database, che restituiscono nome e stile e niente altro.
 */

export interface OwnCommunityProfile {
  nameColor: NameColor | null;
  nameStyle: NameStyle | null;
}

export async function getOwnCommunityProfile(userId: string): Promise<OwnCommunityProfile> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("name_color, name_style")
    .eq("id", userId)
    .maybeSingle();
  return {
    nameColor: (profile?.name_color as NameColor | null) ?? null,
    nameStyle: (profile?.name_style as NameStyle | null) ?? null,
  };
}

export async function listMatchComments(matchId: number): Promise<MatchCommentFeedRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_comment_feed", { p_match_id: matchId });
  return error ? null : ((data ?? []) as MatchCommentFeedRow[]);
}

/** Ultimi commenti di tutte le partite (chat Partite della Comunità); null se la lettura fallisce. */
export async function listRecentComments(limit = 50): Promise<RecentCommentRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recent_comment_feed", { p_limit: limit });
  return error ? null : ((data ?? []) as RecentCommentRow[]);
}

/** Messaggi di una chat della comunità, dal più recente; null se la lettura fallisce. */
export async function listCommunityPosts(
  channel: CommunityChannel,
  limit = 50,
): Promise<CommunityPostRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("community_feed", {
    p_channel: channel,
    p_limit: limit,
  });
  if (error) return null;
  // Una schedina non conforme (scritta prima del vincolo `community_posts_slip_shape`) si
  // scarta qui: non deve rompere la chat né la card in Home.
  return ((data ?? []) as unknown as CommunityPostRow[]).map((row) =>
    row.slip === null ? row : { ...row, slip: parseSharedSlip(row.slip) },
  );
}

/** Risultati delle partite delle schedine condivise (ADR 0070); vuoto se la lettura fallisce. */
export async function listSharedResults(
  ids: readonly number[],
): Promise<Map<number, SharedResult>> {
  const out = new Map<number, SharedResult>();
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_match_results")
    .select("match_id, home_score, away_score, observed_at")
    .in("match_id", ids.slice(0, 500));
  for (const r of (data ?? []) as {
    match_id: number;
    home_score: number;
    away_score: number;
    observed_at: string;
  }[]) {
    out.set(Number(r.match_id), {
      home: r.home_score,
      away: r.away_score,
      observedAt: r.observed_at,
    });
  }
  return out;
}
