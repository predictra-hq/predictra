import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  FreshnessBadge,
  MatchStatusBadge,
  ProviderAttribution,
  QualityBadge,
} from "@/components/football/badges";
import { FilterForm } from "@/components/ui/filter-form";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { formatScore, parseCompetitionCode, parseMatchday } from "@/lib/football/format";
import {
  getCurrentSeason,
  getSourceHealth,
  listCompetitions,
  listMatches,
} from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: "Match Center" };

export default async function MatchCenterPage({ searchParams }: PageProps<"/match-center">) {
  await requireUser();
  const m = getMessages();
  const params = await searchParams;

  const competitions = await listCompetitions();
  if (competitions.length === 0) {
    return (
      <>
        <PageHeader title={m.matchCenter.title} description={m.matchCenter.description} />
        <EmptyState>{m.matchCenter.noData}</EmptyState>
      </>
    );
  }

  const requestedCode = parseCompetitionCode(params.c);
  const competition = competitions.find((c) => c.code === requestedCode) ?? competitions[0]!;
  const season = await getCurrentSeason(competition.id);
  const requestedMatchday = parseMatchday(params.g);
  const matchday =
    requestedMatchday ?? season?.currentMatchday ?? (season?.maxMatchday ? 1 : "all");
  const [matches, sources] = await Promise.all([
    season ? listMatches(season.id, matchday) : Promise.resolve([]),
    getSourceHealth(),
  ]);
  const matchdays = season?.maxMatchday
    ? Array.from({ length: season.maxMatchday }, (_, i) => i + 1)
    : [];

  return (
    <>
      <PageHeader title={m.matchCenter.title} description={m.matchCenter.description} />

      <FilterForm
        resets={{ c: ["g"] }}
        className="mb-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
      >
        <Field label={m.matchCenter.competition} htmlFor="c">
          <Select id="c" name="c" defaultValue={competition.code ?? undefined}>
            {competitions.map((c) =>
              c.code ? (
                <option key={c.id} value={c.code}>
                  {c.name}
                </option>
              ) : null,
            )}
          </Select>
        </Field>
        <Field label={m.matchCenter.matchday} htmlFor="g">
          <Select id="g" name="g" defaultValue={String(matchday)}>
            <option value="all">{m.matchCenter.allMatchdays}</option>
            {matchdays.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">
          {m.matchCenter.show}
        </Button>
      </FilterForm>

      <Alert className="mb-4">{m.matchCenter.delayedNote}</Alert>

      <Card scrollLabel={`${competition.name} ${season?.label ?? ""}`.trim()} className="p-0">
        {matches.length === 0 ? (
          <p className="p-5 text-sm text-muted">{m.matchCenter.noMatches}</p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">
              {competition.name} {season?.label ?? ""} — {m.matchCenter.matchday}{" "}
              {matchday === "all" ? m.matchCenter.allMatchdays : matchday}
            </caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {m.matchCenter.kickoff}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  {m.matchCenter.home}
                </th>
                <th scope="col" className="px-4 py-3 text-center">
                  {m.matchCenter.score}
                </th>
                <th scope="col" className="px-4 py-3">
                  {m.matchCenter.away}
                </th>
                <th scope="col" className="px-4 py-3">
                  {m.matchCenter.status}
                </th>
                <th scope="col" className="px-4 py-3">
                  {m.matchCenter.freshness}
                </th>
                <th scope="col" className="px-4 py-3">
                  {m.matchCenter.quality}
                </th>
              </tr>
            </thead>
            <tbody>
              {matches.map((r) => (
                <tr key={r.match_id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatDateTime(r.kickoff_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.home_team_short_name ?? r.home_team_name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center font-mono">
                    <Link
                      href={`/match-center/${r.match_id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 transition-colors hover:border-positive hover:text-positive-strong"
                    >
                      {/* Il nome accessibile contiene il testo visibile (WCAG 2.5.3). */}
                      {formatScore(r.home_score, r.away_score)}
                      <span className="sr-only">
                        {` — ${m.matchCenter.details}: ${r.home_team_name} – ${r.away_team_name}`}
                      </span>
                      <ChevronRight size={14} aria-hidden="true" className="text-muted" />
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.away_team_short_name ?? r.away_team_name}</td>
                  <td className="px-4 py-3">
                    <MatchStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <FreshnessBadge freshness={r.freshness} />
                  </td>
                  <td className="px-4 py-3">
                    <QualityBadge quality={r.quality} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ProviderAttribution texts={sources.map((s) => s.attribution)} />
    </>
  );
}
