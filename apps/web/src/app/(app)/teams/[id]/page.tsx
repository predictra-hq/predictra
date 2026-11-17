import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { TeamSeasonStatsRow } from "@predictra/shared-types";
import { Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { formatScore, parseId } from "@/lib/football/format";
import { getTeam, listTeamMatches, listTeamSeasonStatsOf } from "@/lib/football/queries";
import {
  recentForm,
  teamMatchView,
  type TeamMatchView,
  type TeamOutcome,
} from "@/lib/football/team";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatDecimal } from "@/lib/odds/format";
import { perMatch } from "@/lib/odds/stats";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Squadra" };

const FORM_SIZE = 5;

const OUTCOME_STYLE: Record<TeamOutcome, string> = {
  V: "border-positive/40 bg-positive-soft text-positive-strong",
  N: "border-border-strong bg-surface-2 text-muted",
  P: "border-negative/40 bg-negative-soft text-negative-strong",
};

/** Lettera dell'esito in un riquadro colorato; il significato è anche nel testo per screen reader. */
function OutcomeMark({ outcome }: { outcome: TeamOutcome }) {
  const labels = getMessages().teams.formLabels;
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold",
        OUTCOME_STYLE[outcome],
      )}
    >
      <span aria-hidden="true">{outcome}</span>
      <span className="sr-only">{labels[outcome]}</span>
    </span>
  );
}

function MatchList({ views, empty }: { views: readonly TeamMatchView[]; empty: string }) {
  const m = getMessages().teams;
  if (views.length === 0) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-2 divide-y divide-border">
      {views.map((v) => (
        <li key={v.matchId}>
          <Link
            href={`/match-center/${v.matchId}`}
            className="flex items-center gap-3 py-2.5 hover:bg-surface-2 active:bg-surface-2"
          >
            {v.outcome ? <OutcomeMark outcome={v.outcome} /> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                <span className="sr-only">{m.versus} </span>
                {v.opponentName}
              </span>
              <span className="block truncate text-xs text-muted">
                {formatDateTime(v.kickoffAt)} · {v.isHome ? m.home : m.away} · {v.competitionName}
              </span>
            </span>
            {v.outcome ? (
              <span className="shrink-0 font-mono font-semibold">
                {formatScore(v.goalsFor, v.goalsAgainst)}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right font-mono text-sm">{children}</dd>
    </div>
  );
}

function SeasonStats({ title, s }: { title: string; s: TeamSeasonStatsRow }) {
  const m = getMessages().teams;
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <dl className="mt-3">
        <StatRow label={m.played}>{s.played}</StatRow>
        <StatRow label={m.record}>
          {s.won} · {s.draw} · {s.lost}
        </StatRow>
        <StatRow label={m.goals}>
          {s.goals_for} · {s.goals_against}
        </StatRow>
        <StatRow label={m.goalsPerMatch}>
          {formatDecimal(perMatch(s.goals_for, s.played))} ·{" "}
          {formatDecimal(perMatch(s.goals_against, s.played))}
        </StatRow>
        <StatRow label={m.homeRecord}>
          {s.home_won} / {s.home_played}
        </StatRow>
        <StatRow label={m.awayRecord}>
          {s.away_won} / {s.away_played}
        </StatRow>
        <StatRow label={m.cleanSheets}>
          {s.clean_sheets} / {s.played}
        </StatRow>
        <StatRow label={m.bothScored}>
          {s.both_scored} / {s.played}
        </StatRow>
        <StatRow label={m.over25}>
          {s.over_2_5} / {s.played}
        </StatRow>
      </dl>
    </Card>
  );
}

/**
 * Pagina di una squadra: forma, prossime partite, ultimi risultati e numeri delle stagioni
 * in corso. Solo letture sulle viste già esistenti (`v_match_center`, `v_team_season_stats`).
 */
export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  await requireUser();
  const m = getMessages().teams;
  const teamId = parseId((await params).id);
  if (teamId === null) notFound();

  const [team, matches, stats] = await Promise.all([
    getTeam(teamId),
    listTeamMatches(teamId, new Date()),
    listTeamSeasonStatsOf(teamId),
  ]);
  if (!team) notFound();

  const played = matches.played.map((r) => teamMatchView(r, teamId));
  const upcoming = matches.upcoming.map((r) => teamMatchView(r, teamId));
  const form = recentForm(played, FORM_SIZE);

  // Stagioni "in corso": quelle delle partite appena giocate o in programma.
  const seasonTitles = new Map<number, string>();
  for (const r of [...matches.upcoming, ...matches.played]) {
    if (!seasonTitles.has(Number(r.season_id)))
      seasonTitles.set(Number(r.season_id), `${r.competition_name} ${r.season_label}`);
  }
  const currentStats = stats.filter((s) => seasonTitles.has(Number(s.season_id)));

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/teams" className="text-muted hover:text-fg">
          ← {m.title}
        </Link>
      </p>
      <PageHeader title={team.name} />

      <Card>
        <CardTitle>{fillTemplate(m.form, { n: FORM_SIZE })}</CardTitle>
        {form.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{m.noMatchesPlayed}</p>
        ) : (
          <p className="mt-3 flex gap-1.5">
            {form.map((o, i) => (
              <OutcomeMark key={i} outcome={o} />
            ))}
          </p>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>{m.upcoming}</CardTitle>
          <MatchList views={upcoming} empty={m.noUpcoming} />
        </Card>
        <Card>
          <CardTitle>{m.lastMatches}</CardTitle>
          <MatchList views={played} empty={m.noMatchesPlayed} />
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">{m.seasonNumbers}</h2>
      {currentStats.length === 0 ? (
        <p className="text-sm text-muted">{m.noStats}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {currentStats.map((s) => (
            <SeasonStats
              key={`${s.season_id}-${s.competition_id}`}
              title={seasonTitles.get(Number(s.season_id)) ?? ""}
              s={s}
            />
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-subtle">{m.statsNote}</p>
    </>
  );
}
