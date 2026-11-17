import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/primitives";
import { listFollowedMatches, listFollows } from "@/lib/football/follows";
import { formatDateTime, getMessages } from "@/lib/i18n";

/**
 * Home: prossime partite delle squadre seguite. Senza squadre seguite o senza partite in
 * programma il riquadro non compare.
 */
export async function FollowedMatchesCard() {
  const m = getMessages().follows;
  const { teamIds } = await listFollows();
  if (teamIds.length === 0) return null;
  const matches = await listFollowedMatches(teamIds, new Date());
  if (matches.length === 0) return null;
  const followed = new Set(teamIds);

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle>{m.homeTitle}</CardTitle>
        <Link href="/teams" className="text-xs text-muted hover:text-fg">
          {m.manage}
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {matches.map((r) => (
          <li key={r.match_id}>
            <Link
              href={`/match-center/${r.match_id}`}
              className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-surface-2 active:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate">
                  <span className={followed.has(Number(r.home_team_id)) ? "font-semibold" : ""}>
                    {r.home_team_short_name ?? r.home_team_name}
                  </span>
                  {" – "}
                  <span className={followed.has(Number(r.away_team_id)) ? "font-semibold" : ""}>
                    {r.away_team_short_name ?? r.away_team_name}
                  </span>
                </span>
                <span className="block truncate text-xs text-muted">{r.competition_name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{formatDateTime(r.kickoff_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
