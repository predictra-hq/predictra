import "server-only";
import type {
  BirthdayTodayRow,
  MatchCommentFeedRow,
  NameColor,
  NameStyle,
  RecentCommentRow,
} from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";

/**
 * Letture della comunità (ADR 0058), sempre con la sessione dell'utente: i dati altrui
 * arrivano solo dalle funzioni del database, che restituiscono nome e stile e niente altro.
 */

export interface OwnCommunityProfile {
  birthDate: string | null;
  showBirthday: boolean;
  nameColor: NameColor | null;
  nameStyle: NameStyle | null;
}

export async function getOwnCommunityProfile(userId: string): Promise<OwnCommunityProfile> {
  const supabase = await createClient();
  const [{ data: birthday }, { data: profile }] = await Promise.all([
    supabase
      .from("user_birthdays")
      .select("birth_date, show_birthday")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("name_color, name_style").eq("id", userId).maybeSingle(),
  ]);
  return {
    birthDate: (birthday?.birth_date as string | undefined) ?? null,
    showBirthday: Boolean(birthday?.show_birthday),
    nameColor: (profile?.name_color as NameColor | null) ?? null,
    nameStyle: (profile?.name_style as NameStyle | null) ?? null,
  };
}

export async function listMatchComments(matchId: number): Promise<MatchCommentFeedRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_comment_feed", { p_match_id: matchId });
  return error ? null : ((data ?? []) as MatchCommentFeedRow[]);
}

export async function listBirthdaysToday(): Promise<BirthdayTodayRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("birthdays_today");
  return error ? [] : ((data ?? []) as BirthdayTodayRow[]);
}

/** Ultimi commenti di tutte le partite (pagina Discussioni); null se la lettura fallisce. */
export async function listRecentComments(limit = 50): Promise<RecentCommentRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recent_comment_feed", { p_limit: limit });
  return error ? null : ((data ?? []) as RecentCommentRow[]);
}
