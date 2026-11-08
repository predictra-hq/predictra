import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  FreshnessBadge,
  MatchStatusBadge,
  ProviderAttribution,
  QualityBadge,
} from "@/components/football/badges";
import { MatchPredictions } from "@/components/predictions/match-predictions";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { formatScore, parseId, severityTone } from "@/lib/football/format";
import { getMatch } from "@/lib/football/queries";
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
  const { match, issues, attribution } = await getMatch(matchId);
  if (!match) notFound();

  const back = `/match-center?c=${encodeURIComponent(match.competition_code ?? "")}${
    match.matchday ? `&g=${match.matchday}` : ""
  }`;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href={back} className="text-muted hover:text-fg">
          ← {m.matchCenter.back}
        </Link>
      </p>
      <PageHeader
        title={`${match.home_team_name} – ${match.away_team_name}`}
        description={`${match.competition_name} · ${m.matchCenter.season} ${match.season_label}${
          match.matchday ? ` · ${m.matchCenter.matchday} ${match.matchday}` : ""
        }`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>{m.matchCenter.matchTitle}</CardTitle>
          <p className="mt-4 text-center font-mono text-3xl font-semibold">
            {formatScore(match.home_score, match.away_score)}
          </p>
          <dl className="mt-4">
            <Row label={m.matchCenter.status}>
              <MatchStatusBadge status={match.status} />
            </Row>
            <Row label={m.matchCenter.kickoff}>{formatDateTime(match.kickoff_at)}</Row>
            <Row label={m.matchCenter.halfTime}>
              {formatScore(match.home_score_ht, match.away_score_ht)}
            </Row>
            {match.score_duration ? (
              <Row label={m.matchCenter.duration}>
                {m.matchCenter.scoreDuration[match.score_duration]}
              </Row>
            ) : null}
            {match.stage ? <Row label={m.matchCenter.stage}>{match.stage}</Row> : null}
            {match.group_name ? <Row label={m.matchCenter.group}>{match.group_name}</Row> : null}
          </dl>
        </Card>

        <Card>
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
      </div>

      <MatchPredictions matchId={match.match_id} />

      <Card className="mt-4">
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

      <ProviderAttribution texts={[attribution]} />
    </>
  );
}
