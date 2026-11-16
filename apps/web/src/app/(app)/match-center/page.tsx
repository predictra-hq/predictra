import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { pickLabel } from "@/components/bet-builder/likely";
import { MatchStatusBadge, ProviderAttribution } from "@/components/football/badges";
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
import { strongestPicks } from "@/lib/certainties/load";
import type { Pick } from "@/lib/certainties/logic";
import { FavoriteCompetitionButton } from "@/components/football/favorite-button";
import { chooseCompetition, readFavoriteCompetition } from "@/lib/football/favorite";
import { formatScore, parseCompetitionCode, parseId, parseMatchday } from "@/lib/football/format";
import {
  getCurrentSeason,
  getSourceHealth,
  listCompetitions,
  listMatches,
  listSeasons,
} from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { formatPercent } from "@/lib/predictions/format";

export const metadata: Metadata = { title: "Partite" };

/** Una sola lettura per tutte le righe della pagina (React `cache` per richiesta). */
const strongestFor = cache((idsKey: string) =>
  strongestPicks(idsKey ? idsKey.split(",").map(Number) : []).catch(() => new Map<number, Pick>()),
);

async function StrongestCell({ idsKey, matchId }: { idsKey: string; matchId: number }) {
  const map = await strongestFor(idsKey);
  return <StrongestPick pick={map.get(matchId)} />;
}

async function StrongestLine({ idsKey, matchId }: { idsKey: string; matchId: number }) {
  const pick = (await strongestFor(idsKey)).get(matchId);
  if (!pick) return null;
  return (
    <span className="mt-1 block text-xs text-muted">
      <StrongestPick pick={pick} />
    </span>
  );
}

function StrongestPick({ pick }: { pick: Pick | undefined }) {
  if (!pick) return <span className="text-subtle">–</span>;
  return (
    <span className="whitespace-nowrap">
      {pickLabel(pick)}{" "}
      <span className="font-mono font-semibold text-positive-strong">
        {formatPercent(pick.probability, 0)}
      </span>
    </span>
  );
}

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
  const favorite = await readFavoriteCompetition();
  const competition = chooseCompetition(competitions, requestedCode, favorite)!;
  const requestedSeason = typeof params.s === "string" ? parseId(params.s) : null;
  const [season, seasons] = await Promise.all([
    getCurrentSeason(competition.id, requestedSeason),
    listSeasons(competition.id),
  ]);
  const isLatest = season !== null && seasons[0]?.id === season.id;
  const requestedMatchday = parseMatchday(params.g);
  // Stagione in corso: la giornata corrente; stagione passata: la prima.
  const matchday =
    requestedMatchday ??
    (isLatest ? season?.currentMatchday : null) ??
    (season?.maxMatchday ? 1 : "all");
  const [matches, sources] = await Promise.all([
    season ? listMatches(season.id, matchday) : Promise.resolve([]),
    getSourceHealth(),
  ]);
  // Giocata più forte (dal 70%): caricata a parte, la tabella compare subito.
  const idsKey = matches.map((r) => r.match_id).join(",");
  const matchdays = season?.maxMatchday
    ? Array.from({ length: season.maxMatchday }, (_, i) => i + 1)
    : [];

  return (
    <>
      <PageHeader title={m.matchCenter.title} description={m.matchCenter.description} />

      <FilterForm
        resets={{ c: ["s", "g"], s: ["g"] }}
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem_10rem_auto] sm:items-end"
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
        <Field label={m.matchCenter.season} htmlFor="s">
          <Select id="s" name="s" defaultValue={season ? String(season.id) : undefined}>
            {seasons.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={m.matchCenter.matchday} htmlFor="g">
          <Select id="g" name="g" defaultValue={String(matchday)}>
            <option value="all">{m.matchCenter.allMatchdays}</option>
            {matchdays.map((d) => (
              <option key={d} value={d}>
                {isLatest && d === season?.currentMatchday
                  ? fillTemplate(m.matchCenter.currentMatchday, { n: d })
                  : d}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">
          {m.matchCenter.show}
        </Button>
      </FilterForm>
      {competition.code ? (
        <FavoriteCompetitionButton
          code={competition.code}
          isFavorite={competition.code === favorite}
        />
      ) : null}

      <Alert className="mb-4">{m.matchCenter.delayedNote}</Alert>

      <Card scrollLabel={`${competition.name} ${season?.label ?? ""}`.trim()} className="p-0">
        {matches.length === 0 ? (
          <p className="p-5 text-sm text-muted">{m.matchCenter.noMatches}</p>
        ) : null}
        {/* Telefono: una riga per partita, tutta cliccabile, senza scorrere di lato. */}
        {matches.length > 0 ? (
          <ul className="divide-y divide-border sm:hidden">
            {matches.map((r) => (
              <li key={r.match_id}>
                <Link
                  href={`/match-center/${r.match_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-xs text-muted">
                      {formatDateTime(r.kickoff_at)}
                      <MatchStatusBadge status={r.status} />
                    </span>
                    <span className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                      <span className="truncate text-right">
                        {r.home_team_short_name ?? r.home_team_name}
                      </span>
                      <span className="font-mono">{formatScore(r.home_score, r.away_score)}</span>
                      <span className="truncate">{r.away_team_short_name ?? r.away_team_name}</span>
                    </span>
                    <Suspense fallback={null}>
                      <StrongestLine idsKey={idsKey} matchId={r.match_id} />
                    </Suspense>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {matches.length === 0 ? null : (
          <table className="hidden w-full min-w-[760px] text-left text-sm sm:table">
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
                  {m.matchCenter.strongestPick}
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
                    <Suspense fallback={<span className="text-subtle">…</span>}>
                      <StrongestCell idsKey={idsKey} matchId={r.match_id} />
                    </Suspense>
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
