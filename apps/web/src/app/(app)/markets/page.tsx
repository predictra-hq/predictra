import type { BestOddsH2hRow, MatchOddsH2hRow } from "@predictra/shared-types";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { FreshnessBadge, ProviderAttribution } from "@/components/football/badges";
import { BookmakerKindBadge } from "@/components/odds/badges";
import { BookmakerOddsTable } from "@/components/odds/bookmaker-odds-table";
import { CompetitionFilter } from "@/components/odds/competition-filter";
import { MarketsTable } from "@/components/odds/markets-table";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { parseCompetitionCode } from "@/lib/football/format";
import { formatDateTime, getMessages } from "@/lib/i18n";
import {
  fillTemplate,
  formatOdds,
  freshnessAt,
  groupOddsByEvent,
  type OddsEventGroup,
} from "@/lib/odds/format";
import {
  getOddsMaxAge,
  getProvider,
  listBestOdds,
  listCollectedMarkets,
  listMatchOdds,
  listOddsCoverage,
  ODDS_PROVIDER,
} from "@/lib/odds/queries";
import { SectionTabs } from "@/components/shell/section-tabs";

export const metadata: Metadata = { title: "Quote" };

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-3 ${className ?? ""}`}>
      {children}
    </th>
  );
}

function BestOdd({
  label,
  price,
  bookmaker,
  rows,
}: {
  label: string;
  price: number;
  bookmaker: string;
  rows: readonly MatchOddsH2hRow[];
}) {
  const row = rows.find((r) => r.bookmaker === bookmaker);
  return (
    <span className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-base">{formatOdds(price)}</span>
      <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {row?.bookmaker_title ?? bookmaker}
        {row ? <BookmakerKindBadge italian={row.italian_market} /> : null}
      </span>
    </span>
  );
}

function EventCard({ group, best }: { group: OddsEventGroup; best: BestOddsH2hRow | undefined }) {
  const m = getMessages().marketIntelligence;
  const all = [...group.italian, ...group.reference];
  const total = all.length;
  return (
    <details className="group rounded-[var(--radius-card)] border border-border bg-surface">
      <summary className="flex cursor-pointer list-none flex-col gap-3 rounded-[var(--radius-card)] p-4 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex flex-col gap-1">
          <span className="font-medium">
            {group.homeTeam} – {group.awayTeam}
          </span>
          <span className="text-xs text-muted">
            {m.kickoff}: {formatDateTime(group.commenceTime)} ·{" "}
            {fillTemplate(m.freshBookmakers, { fresh: group.freshBookmakers, total })}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {group.matchId === null ? <Badge tone="warning">{m.unmatched}</Badge> : null}
          <FreshnessBadge freshness={group.freshness} />
          <ChevronDown
            size={18}
            aria-hidden="true"
            className="text-muted transition-transform group-open:rotate-180"
          />
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-border p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {group.matchId !== null ? (
            <Link href={`/match-center/${group.matchId}`} className="text-positive hover:underline">
              {m.openMatch}
            </Link>
          ) : (
            <span className="text-xs text-muted">{m.unmatchedHint}</span>
          )}
        </div>

        <section aria-label={m.bestOdds}>
          <h3 className="mb-2 text-sm font-semibold">{m.bestOdds}</h3>
          {best ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <BestOdd
                label={m.home}
                price={best.best_home_price}
                bookmaker={best.best_home_bookmaker}
                rows={all}
              />
              <BestOdd
                label={m.draw}
                price={best.best_draw_price}
                bookmaker={best.best_draw_bookmaker}
                rows={all}
              />
              <BestOdd
                label={m.away}
                price={best.best_away_price}
                bookmaker={best.best_away_bookmaker}
                rows={all}
              />
            </div>
          ) : (
            <Alert tone="warning">{m.noBestOdds}</Alert>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">{m.italianSection}</h3>
          <p className="mb-2 text-xs text-muted">{m.italianNote}</p>
          {group.italian.length > 0 ? (
            <BookmakerOddsTable
              rows={group.italian}
              caption={`${m.italianSection}: ${group.homeTeam} – ${group.awayTeam}`}
            />
          ) : (
            <p className="text-sm text-muted">{m.noItalian}</p>
          )}
        </section>

        {group.reference.length > 0 ? (
          <section>
            <h3 className="text-sm font-semibold">{m.referenceSection}</h3>
            <p className="mb-2 text-xs text-muted">{m.referenceNote}</p>
            <BookmakerOddsTable
              rows={group.reference}
              caption={`${m.referenceSection}: ${group.homeTeam} – ${group.awayTeam}`}
            />
          </section>
        ) : null}
      </div>
    </details>
  );
}

export default async function MarketsPage({ searchParams }: PageProps<"/markets">) {
  await requireUser();
  const m = getMessages().marketIntelligence;
  const params = await searchParams;

  const [coverage, maxAge, collected, provider] = await Promise.all([
    listOddsCoverage(),
    getOddsMaxAge(),
    listCollectedMarkets(),
    getProvider(ODDS_PROVIDER),
  ]);
  const requested = parseCompetitionCode(params.c);
  const selected =
    coverage.find((c) => c.competition_code === requested) ??
    coverage.find((c) => c.events > 0) ??
    coverage[0];

  const rows = selected ? await listMatchOdds(selected.competition_id) : [];
  const groups = groupOddsByEvent(rows);
  const best = await listBestOdds(groups.map((g) => g.eventId));
  const bestByEvent = new Map(best.map((b) => [b.event_id, b]));
  const eventsWithOdds = coverage.reduce((acc, c) => acc + (c.bookmakers > 0 ? c.events : 0), 0);
  const hours = maxAge === null ? "—" : String(Math.round(maxAge / 3_600_000));

  return (
    <>
      <SectionTabs section="football" current="/markets" />
      <PageHeader title={m.title} description={m.description} />

      <Alert tone="warning" className="mb-6">
        {fillTemplate(m.staleNote, { hours })}
      </Alert>

      <h2 className="mb-3 text-lg font-semibold">{m.eventsTitle}</h2>
      {coverage.length > 0 ? (
        <CompetitionFilter
          competitions={coverage.map((c) => ({
            code: c.competition_code,
            name: c.competition_name,
          }))}
          selected={selected?.competition_code ?? null}
          label={m.competition}
          submitLabel={m.show}
        />
      ) : null}
      <p className="mb-3 text-xs text-muted">
        {m.disclaimer} {m.methodNote}
      </p>
      {groups.length === 0 ? (
        <EmptyState>{m.noEvents}</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <EventCard key={g.eventId} group={g} best={bestByEvent.get(g.eventId)} />
          ))}
        </div>
      )}

      {/* Dati tecnici sulla raccolta: chiusi, le quote delle partite vengono prima. */}
      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-muted hover:text-fg">
          {m.technicalSection}
        </summary>
        <div className="mt-4">
          <h2 className="mb-1 text-lg font-semibold">{m.coverageTitle}</h2>
          <p className="mb-3 text-sm text-muted">{m.coverageDescription}</p>
          <Card scrollLabel={m.coverageTitle} className="mb-8 p-0">
            {coverage.every((c) => c.events === 0) ? (
              <p className="p-5 text-sm text-muted">{m.noCoverage}</p>
            ) : (
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">{m.coverageTitle}</caption>
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <Th>{m.competition}</Th>
                    <Th className="text-right">{m.events}</Th>
                    <Th className="text-right">{m.matchedEvents}</Th>
                    <Th className="text-right">{m.bookmakers}</Th>
                    <Th className="text-right">{m.italianBookmakers}</Th>
                    <Th>{m.lastObservation}</Th>
                    <Th>{m.freshness}</Th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map((c) => (
                    <tr key={c.competition_id} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-4 py-3">
                        {c.competition_code ? (
                          <Link
                            href={`/markets?c=${c.competition_code}`}
                            className="hover:text-positive"
                          >
                            {c.competition_name}
                          </Link>
                        ) : (
                          c.competition_name
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{c.events}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.matched_events}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.bookmakers}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.italian_bookmakers}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {c.last_observed_at ? formatDateTime(c.last_observed_at) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <FreshnessBadge freshness={freshnessAt(c.last_observed_at, maxAge)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <h2 className="mb-1 mt-6 text-lg font-semibold">{m.marketsTitle}</h2>
          <p className="mb-3 text-sm text-muted">{m.marketsDescription}</p>
          <MarketsTable collectedCodes={collected} eventsWithOdds={eventsWithOdds} />
        </div>
      </details>

      <ProviderAttribution texts={[provider?.attribution]} />
    </>
  );
}
