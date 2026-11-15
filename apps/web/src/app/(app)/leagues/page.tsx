import type { StandingRow } from "@predictra/shared-types";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FreshnessBadge, ProviderAttribution, QualityBadge } from "@/components/football/badges";
import { CompetitionFilter } from "@/components/odds/competition-filter";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { chooseCompetition, readFavoriteCompetition } from "@/lib/football/favorite";
import { parseCompetitionCode } from "@/lib/football/format";
import { getSourceHealth } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatDecimal, formatPercent, formatSigned } from "@/lib/odds/format";
import {
  FOOTBALL_PROVIDER,
  listCompetitionSeasons,
  listLatestStandings,
  listLeagueSeasonStats,
} from "@/lib/odds/queries";
import { homeAdvantage } from "@/lib/odds/stats";

export const metadata: Metadata = { title: "Campionati" };

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-3 ${className ?? ""}`}>
      {children}
    </th>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-lg">{children}</dd>
    </div>
  );
}

/** Tabelle della classifica separate per fase e girone (es. Champions League). */
function groupStandings(
  rows: readonly StandingRow[],
): { key: string; title: string; rows: StandingRow[] }[] {
  const groups = new Map<string, { key: string; title: string; rows: StandingRow[] }>();
  for (const row of rows) {
    const key = `${row.stage}|${row.group_name}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, title: row.group_name, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

export default async function LeaguesPage({ searchParams }: PageProps<"/leagues">) {
  await requireUser();
  const m = getMessages().leagueIntelligence;
  const params = await searchParams;

  const competitions = await listCompetitionSeasons();
  if (competitions.length === 0) {
    return (
      <>
        <PageHeader title={m.title} description={m.description} />
        <EmptyState>{m.noData}</EmptyState>
      </>
    );
  }
  const requested = parseCompetitionCode(params.c);
  const competition = chooseCompetition(competitions, requested, await readFavoriteCompetition())!;
  const seasonIds = competitions.map((c) => c.seasonId).filter((id): id is number => id !== null);

  const [leagueStats, standings, sources] = await Promise.all([
    listLeagueSeasonStats(seasonIds),
    competition.seasonId ? listLatestStandings(competition.seasonId) : Promise.resolve([]),
    getSourceHealth(),
  ]);
  const footballSource = sources.find((s) => s.provider === FOOTBALL_PROVIDER);
  const selectedStats = competition.seasonId ? leagueStats.get(competition.seasonId) : undefined;
  const advantage = selectedStats ? homeAdvantage(selectedStats) : null;
  const standingGroups = groupStandings(standings);
  const firstStanding = standings[0];

  return (
    <>
      <PageHeader title={m.title} description={m.description} />

      <h2 className="mb-1 text-lg font-semibold">{m.overviewTitle}</h2>
      <p className="mb-3 text-sm text-muted">{m.overviewDescription}</p>
      <Card scrollLabel={m.overviewTitle} className="mb-8 p-0">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <caption className="sr-only">{m.overviewTitle}</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <Th>{m.competition}</Th>
              <Th>{m.season}</Th>
              <Th className="text-right">{m.matches}</Th>
              <Th className="text-right">{m.avgGoals}</Th>
              <Th className="text-right">{m.avgHome}</Th>
              <Th className="text-right">{m.avgAway}</Th>
              <Th className="text-right">{m.homeWin}</Th>
              <Th className="text-right">{m.draw}</Th>
              <Th className="text-right">{m.awayWin}</Th>
              <Th className="text-right">{m.over25}</Th>
              <Th className="text-right">{m.bothScored}</Th>
              <Th className="text-right">{m.homeAdvantage}</Th>
            </tr>
          </thead>
          <tbody>
            {competitions.map((c) => {
              const s = c.seasonId ? leagueStats.get(c.seasonId) : undefined;
              const adv = s ? homeAdvantage(s) : null;
              return (
                <tr key={c.competitionId} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">
                    {c.code ? (
                      <Link href={`/leagues?c=${c.code}`} className="hover:text-positive">
                        {c.name}
                      </Link>
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="sm-secondary px-3 py-2 text-muted">{c.seasonLabel ?? "—"}</td>
                  {s ? (
                    <>
                      <td className="px-3 py-2 text-right font-mono">{s.matches}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatDecimal(Number(s.avg_goals))}
                      </td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">
                        {formatDecimal(Number(s.avg_home_goals))}
                      </td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">
                        {formatDecimal(Number(s.avg_away_goals))}
                      </td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">
                        {formatPercent(Number(s.home_win_rate), 0)}
                      </td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">
                        {formatPercent(Number(s.draw_rate), 0)}
                      </td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">
                        {formatPercent(Number(s.away_win_rate), 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatPercent(Number(s.over_2_5_rate), 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatPercent(Number(s.both_scored_rate), 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatSigned(adv?.goals)}</td>
                    </>
                  ) : (
                    <td colSpan={10} className="px-3 py-2 text-muted">
                      {m.noLeagueStats}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <CompetitionFilter
        competitions={competitions}
        selected={competition.code}
        label={m.competition}
        submitLabel={m.show}
      />

      <Card className="mb-4">
        <CardTitle>
          {m.homeAdvantageTitle} — {competition.name} {competition.seasonLabel ?? ""}
        </CardTitle>
        <p className="mt-1 text-xs text-muted">{m.homeAdvantageNote}</p>
        {advantage ? (
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={m.goalsDiff}>{formatSigned(advantage.goals)}</Stat>
            <Stat label={m.winRateDiff}>{formatSigned(advantage.winRate * 100, 1)} pp</Stat>
            <Stat label={m.pointsHome}>{formatDecimal(advantage.homePoints)}</Stat>
            <Stat label={m.pointsAway}>{formatDecimal(advantage.awayPoints)}</Stat>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted">{m.noLeagueStats}</p>
        )}
      </Card>

      <h2 className="mb-1 mt-8 text-lg font-semibold">{m.standingsTitle}</h2>
      {firstStanding ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          {fillTemplate(m.standingsSource, {
            provider: footballSource?.name ?? firstStanding.provider,
            observedAt: formatDateTime(firstStanding.observed_at),
          })}
          <FreshnessBadge freshness={firstStanding.freshness} />
        </p>
      ) : null}
      {standingGroups.length === 0 ? (
        <EmptyState>{m.noStandings}</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {standingGroups.map((g) => (
            <Card
              key={g.key}
              scrollLabel={`${m.standingsTitle} ${competition.name} ${g.title ?? ""}`.trim()}
              className="p-0"
            >
              {g.title ? (
                <h3 className="px-4 pt-4 text-sm font-semibold">
                  {m.group}: {g.title}
                </h3>
              ) : null}
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">
                  {m.standingsTitle} {competition.name} {g.title}
                </caption>
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <Th>{m.position}</Th>
                    <Th>{m.team}</Th>
                    <Th className="text-right">{m.played}</Th>
                    <Th className="text-right">{m.won}</Th>
                    <Th className="text-right">{m.drawn}</Th>
                    <Th className="text-right">{m.lost}</Th>
                    <Th className="text-right">{m.goalsFor}</Th>
                    <Th className="text-right">{m.goalsAgainst}</Th>
                    <Th className="text-right">{m.goalDifference}</Th>
                    <Th className="text-right">{m.points}</Th>
                    <Th>{m.quality}</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.team_id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-muted">{r.position}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{r.team_name}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.played}</td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">{r.won}</td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">{r.draw}</td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">{r.lost}</td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">{r.goals_for}</td>
                      <td className="sm-secondary px-3 py-2 text-right font-mono">
                        {r.goals_against}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatSigned(r.goal_difference, 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{r.points}</td>
                      <td className="px-3 py-2 sm-secondary">
                        <QualityBadge quality={r.quality} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}

      <ProviderAttribution texts={[footballSource?.attribution]} />
    </>
  );
}
