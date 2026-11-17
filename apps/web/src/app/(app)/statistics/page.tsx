import Link from "next/link";
import type { TeamFormRow } from "@predictra/shared-types";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FreshnessBadge, ProviderAttribution } from "@/components/football/badges";
import { FormBadges } from "@/components/odds/badges";
import { CompetitionFilter } from "@/components/odds/competition-filter";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { parseCompetitionCode } from "@/lib/football/format";
import { getSourceHealth } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatDecimal, formatPercent, formatSigned } from "@/lib/odds/format";
import {
  FOOTBALL_PROVIDER,
  getResultsProvenance,
  listCompetitionSeasons,
  listTeamForm,
  listTeamSeasonStats,
} from "@/lib/odds/queries";
import { formPoints, parseForm, perMatch, rate, sortTeamStats } from "@/lib/odds/stats";
import { SectionTabs } from "@/components/shell/section-tabs";

export const metadata: Metadata = { title: "Statistiche" };

function Th({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <th scope="col" className={`px-3 py-3 ${className ?? ""}`} title={title}>
      {children}
    </th>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export default async function StatisticsPage({ searchParams }: PageProps<"/statistics">) {
  await requireUser();
  const m = getMessages().statisticsCenter;
  const params = await searchParams;

  const competitions = await listCompetitionSeasons();
  if (competitions.length === 0) {
    return (
      <>
        <SectionTabs section="football" current="/statistics" />
        <PageHeader title={m.title} description={m.description} />
        <EmptyState>{m.noData}</EmptyState>
      </>
    );
  }
  const requested = parseCompetitionCode(params.c);
  const competition = competitions.find((c) => c.code === requested) ?? competitions[0]!;
  const seasonId = competition.seasonId;

  const [stats, form, provenance, sources] = await Promise.all([
    seasonId ? listTeamSeasonStats(seasonId) : Promise.resolve([]),
    seasonId ? listTeamForm(seasonId) : Promise.resolve(new Map<number, TeamFormRow>()),
    seasonId ? getResultsProvenance(seasonId) : Promise.resolve(null),
    getSourceHealth(),
  ]);
  const rows = sortTeamStats(stats);
  const footballSource = sources.find((s) => s.provider === FOOTBALL_PROVIDER);
  const providerName = footballSource?.name ?? FOOTBALL_PROVIDER;

  return (
    <>
      <SectionTabs section="football" current="/statistics" />
      <PageHeader title={m.title} description={m.description} />

      <CompetitionFilter
        competitions={competitions}
        selected={competition.code}
        label={m.competition}
        submitLabel={m.show}
      />

      <Card className="mb-4">
        <CardTitle>{m.provenanceTitle}</CardTitle>
        <p className="mt-2 text-sm text-muted">
          {fillTemplate(m.provenance, {
            provider: providerName,
            matches: provenance?.matches ?? 0,
          })}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={m.season}>{competition.seasonLabel ?? "—"}</Stat>
          <Stat label={m.lastMatch}>
            {provenance?.lastMatchAt ? formatDateTime(provenance.lastMatchAt) : "—"}
          </Stat>
          <Stat label={m.lastObserved}>
            {provenance?.lastObservedAt ? formatDateTime(provenance.lastObservedAt) : "—"}
          </Stat>
          <Stat label={m.sourceFreshness}>
            <FreshnessBadge freshness={footballSource?.freshness ?? null} />
          </Stat>
        </dl>
        <p className="mt-4 text-xs text-muted">{m.rankingNote}</p>
      </Card>

      <Card
        scrollLabel={`${competition.name} ${competition.seasonLabel ?? ""}`.trim()}
        className="p-0"
      >
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{m.noStats}</p>
        ) : (
          <table className="compact-sm w-full text-left text-sm sm:min-w-[1180px]">
            <caption className="sr-only">
              {competition.name} {competition.seasonLabel ?? ""}
            </caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>#</Th>
                <Th className="sticky left-0 z-10 bg-surface">{m.team}</Th>
                <Th className="text-right">{m.played}</Th>
                <Th className="sm-secondary text-right">{m.won}</Th>
                <Th className="sm-secondary text-right">{m.drawn}</Th>
                <Th className="sm-secondary text-right">{m.lost}</Th>
                <Th className="sm-secondary text-right">{m.goalsFor}</Th>
                <Th className="sm-secondary text-right">{m.goalsAgainst}</Th>
                <Th className="text-right">{m.goalDifference}</Th>
                <Th className="text-right">{m.points}</Th>
                <Th className="sm-secondary text-right">{m.goalsPerMatch}</Th>
                <Th className="sm-secondary text-right">{m.concededPerMatch}</Th>
                <Th className="sm-secondary">{m.home}</Th>
                <Th className="sm-secondary">{m.away}</Th>
                <Th className="sm-secondary text-right">{m.cleanSheets}</Th>
                <Th className="sm-secondary text-right">{m.bothScored}</Th>
                <Th className="sm-secondary text-right">{m.over25}</Th>
                <Th title={m.formHint}>{m.form}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.team_id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-2 font-medium">
                    <Link href={`/teams/${r.team_id}`} className="hover:underline">
                      {r.team_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.played}</td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">{r.won}</td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">{r.draw}</td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">{r.lost}</td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">{r.goals_for}</td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">{r.goals_against}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatSigned(r.goals_for - r.goals_against, 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{r.points}</td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">
                    {formatDecimal(perMatch(r.goals_for, r.played))}
                  </td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">
                    {formatDecimal(perMatch(r.goals_against, r.played))}
                  </td>
                  <td className="sm-secondary whitespace-nowrap px-3 py-2 text-xs text-muted">
                    {fillTemplate(m.homeAwayRecord, {
                      won: r.home_won,
                      played: r.home_played,
                      gf: r.home_goals_for,
                      ga: r.home_goals_against,
                    })}
                  </td>
                  <td className="sm-secondary whitespace-nowrap px-3 py-2 text-xs text-muted">
                    {fillTemplate(m.homeAwayRecord, {
                      won: r.away_won,
                      played: r.away_played,
                      gf: r.away_goals_for,
                      ga: r.away_goals_against,
                    })}
                  </td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">
                    {formatPercent(rate(r.clean_sheets, r.played), 0)}
                  </td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">
                    {formatPercent(rate(r.both_scored, r.played), 0)}
                  </td>
                  <td className="sm-secondary px-3 py-2 text-right font-mono">
                    {formatPercent(rate(r.over_2_5, r.played), 0)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <FormBadges form={form.get(Number(r.team_id))?.form} />
                      <span className="text-xs text-muted">
                        {fillTemplate(m.formPoints, {
                          points: formPoints(parseForm(form.get(Number(r.team_id))?.form)),
                        })}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">{m.legend}</p>

      <ProviderAttribution texts={[footballSource?.attribution]} />
    </>
  );
}
