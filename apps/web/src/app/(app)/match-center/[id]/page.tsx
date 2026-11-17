import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import {
  FreshnessBadge,
  MatchStatusBadge,
  ProviderAttribution,
  QualityBadge,
} from "@/components/football/badges";
import { MatchDetailsCard } from "@/components/football/match-details";
import { MatchCertainties } from "@/components/certainties/match-certainties";
import { OddsMovementCard } from "@/components/odds/odds-movement";
import { MatchPredictions } from "@/components/predictions/match-predictions";
import { Badge, Card, CardSkeleton, CardTitle } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { humanize } from "@/lib/football/details";
import { formatScore, parseId, severityTone } from "@/lib/football/format";
import { getMatch, getMatchDetails } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: "Dettaglio partita" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-0 sm:flex-row sm:gap-4">
      <dt className="text-sm text-muted sm:w-56">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function MatchPage({ params }: PageProps<"/match-center/[id]">) {
  await requireUser();
  const m = getMessages();
  const { id } = await params;
  const matchId = parseId(id);
  if (matchId === null) notFound();
  const [{ match, issues, attribution }, details] = await Promise.all([
    getMatch(matchId),
    getMatchDetails(matchId),
  ]);
  if (!match) notFound();

  const back = `/match-center?c=${encodeURIComponent(match.competition_code ?? "")}&s=${
    match.season_id
  }${match.matchday ? `&g=${match.matchday}` : ""}`;

  const played = match.home_score !== null && match.away_score !== null;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href={back} className="text-muted hover:text-fg">
          ← {m.matchCenter.back}
        </Link>
      </p>
      {/* Tabellone: tutto ciò che serve sulla partita in un colpo d'occhio. */}
      <header className="mb-4 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-5 text-center">
        <p className="text-xs text-muted">
          {match.competition_name}
          {match.matchday ? ` · ${m.matchCenter.matchday} ${match.matchday}` : ""}
          {match.stage && match.stage !== "REGULAR_SEASON"
            ? ` · ${m.matchCenter.stages[match.stage] ?? humanize(match.stage)}`
            : ""}
          {match.group_name ? ` · ${match.group_name}` : ""}
        </p>
        <h1 className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className="text-balance text-base font-semibold leading-tight sm:text-xl">
            {match.home_team_name}
          </span>
          <span
            className="whitespace-nowrap font-mono text-3xl font-semibold"
            aria-hidden={!played}
          >
            {played ? formatScore(match.home_score, match.away_score) : "–"}
          </span>
          <span className="text-balance text-base font-semibold leading-tight sm:text-xl">
            {match.away_team_name}
          </span>
        </h1>
        <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          {formatDateTime(match.kickoff_at)}
          {match.status === "SCHEDULED" ? null : <MatchStatusBadge status={match.status} />}
        </p>
        {match.home_score_ht !== null && match.away_score_ht !== null ? (
          <p className="mt-1 text-xs text-muted">
            {m.matchCenter.halfTime} {formatScore(match.home_score_ht, match.away_score_ht)}
            {match.score_duration && match.score_duration !== "REGULAR"
              ? ` · ${m.matchCenter.scoreDuration[match.score_duration]}`
              : ""}
          </p>
        ) : null}
      </header>

      <Suspense fallback={null}>
        <MatchCertainties matchId={match.match_id} status={match.status} />
      </Suspense>

      <Suspense fallback={<CardSkeleton className="mt-4 h-64" />}>
        <MatchPredictions
          matchId={match.match_id}
          status={match.status}
          kickoffAt={match.kickoff_at}
        />
      </Suspense>

      <Suspense fallback={null}>
        <OddsMovementCard matchId={match.match_id} />
      </Suspense>

      <MatchDetailsCard
        home={{ id: match.home_team_id, name: match.home_team_name }}
        away={{ id: match.away_team_id, name: match.away_team_name }}
        details={details}
      />

      <details className="group mt-4 rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <summary className="cursor-pointer text-sm font-medium text-muted hover:text-fg">
          {m.matchCenter.technical}
          {issues.length > 0 ? ` · ${issues.length} ${m.matchCenter.openIssues.toLowerCase()}` : ""}
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="h-full">
            <CardTitle>{m.matchCenter.provenance}</CardTitle>
            <dl className="mt-4">
              <Row label={m.matchCenter.provider}>{match.provider_name}</Row>
              <Row label={m.matchCenter.providerId}>
                <span className="font-mono text-xs">{match.provider_match_id ?? "—"}</span>
              </Row>
              <Row label={m.matchCenter.observedAt}>{formatDateTime(match.observed_at)}</Row>
              <Row label={m.matchCenter.eventTime}>{formatDateTime(match.event_time)}</Row>
              <Row label={m.matchCenter.freshness}>
                <FreshnessBadge freshness={match.freshness} />
              </Row>
              <Row label={m.matchCenter.quality}>
                <QualityBadge quality={match.quality} />
              </Row>
            </dl>
          </Card>
          <Card className="h-full">
            <CardTitle>{m.matchCenter.openIssues}</CardTitle>
            {issues.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{m.matchCenter.noIssues}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {issues.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={severityTone(i.severity)}>
                      {m.dataCenter.issueSeverity[i.severity]}
                    </Badge>
                    <span className="font-mono text-xs">{i.check_code}</span>
                    <span className="text-muted">{formatDateTime(i.last_seen_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </details>

      <ProviderAttribution texts={[attribution]} />
    </>
  );
}
