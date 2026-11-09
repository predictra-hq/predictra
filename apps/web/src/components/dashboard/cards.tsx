import Link from "next/link";
import type { ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Layers,
  LineChart,
  ListChecks,
  TrendingUp,
} from "lucide-react";
import { formatEuro } from "@/components/bankroll/shared";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { listBankrolls } from "@/lib/bankroll/queries";
import { listActiveProposals } from "@/lib/bet-builder/queries";
import {
  bankrollTotals,
  favourite,
  PREDICTION_HORIZON_DAYS,
  predictionExpectedFrom,
  topProposals,
  withPredictions,
} from "@/lib/dashboard/summary";
import { listNextMatches, listPredictions1x2 } from "@/lib/dashboard/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatSigned } from "@/lib/odds/format";
import { confidenceTone, formatPercent } from "@/lib/predictions/format";
import { listModelVersions } from "@/lib/predictions/queries";
import { cn } from "@/lib/utils";

const DAY = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Rome",
});
const formatDay = (d: Date) => DAY.format(d);

/** Etichetta piccola in maiuscolo in cima ai riquadri. */
function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-xs uppercase tracking-wide text-muted">{children}</p>;
}

/** Riquadro-indicatore con link: tutto il riquadro è cliccabile. */
function StatCard({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group block rounded-[var(--radius-card)] border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <div className="flex items-center justify-between">
        <Kicker>{title}</Kicker>
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="text-subtle transition-transform group-hover:translate-x-0.5"
        />
      </div>
      {children}
    </Link>
  );
}

// --- Modello attivo ------------------------------------------------------------------

export async function ActiveModelCard() {
  const m = getMessages();
  const d = m.dashboard;
  const versions = await listModelVersions().catch(() => null);
  const active = versions?.find((v) => v.status === "ACTIVE") ?? null;
  return (
    <StatCard href="/models" title={d.activeModel}>
      {active ? (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-lg font-semibold">
            {m.modelIntelligence.modelNames[active.model_key]}
          </p>
          <p className="truncate font-mono text-xs text-muted" title={active.version}>
            {active.version}
          </p>
          <p className="text-xs text-muted">
            {d.brier}{" "}
            <span className="font-mono text-fg">
              {active.brier === null ? "–" : Number(active.brier).toFixed(3).replace(".", ",")}
            </span>
            {" · "}
            {d.trainedOn} <span className="font-mono text-fg">{active.training_matches}</span>
          </p>
          {active.beats_baseline === null ? null : (
            <span>
              <Badge tone={active.beats_baseline ? "positive" : "warning"}>
                {active.beats_baseline ? d.beatsBaseline : d.belowBaseline}
              </Badge>
            </span>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{versions ? d.noActiveModel : m.dashboard.noData}</p>
      )}
    </StatCard>
  );
}

// --- Bankroll ------------------------------------------------------------------------

export async function BankrollCard() {
  const d = getMessages().dashboard;
  const rows = await listBankrolls().catch(() => null);
  if (!rows || rows.length === 0) {
    return (
      <StatCard href="/bankroll" title={d.yourBankroll}>
        <p className="mt-2 text-sm text-muted">{rows ? d.noBankroll : d.noData}</p>
        {rows ? (
          <p className="mt-2 text-sm font-medium text-positive-strong">{d.createBankroll}</p>
        ) : null}
      </StatCard>
    );
  }
  const t = bankrollTotals(rows);
  return (
    <StatCard href="/bankroll" title={d.yourBankroll}>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{formatEuro(t.balance)}</p>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted">
        <dt>{d.available}</dt>
        <dd className="text-right font-mono text-fg">{formatEuro(t.available)}</dd>
        <dt>{d.openBets}</dt>
        <dd className="text-right font-mono text-fg">{t.openBets}</dd>
        <dt>{d.roi}</dt>
        <dd
          className={cn(
            "text-right font-mono",
            t.roi === null
              ? "text-fg"
              : t.roi >= 0
                ? "text-positive-strong"
                : "text-negative-strong",
          )}
        >
          {t.roi === null ? "–" : formatPercent(t.roi)}
        </dd>
      </dl>
      {t.count > 1 ? (
        <p className="mt-1 text-xs text-muted">{fillTemplate(d.bankrollsCount, { n: t.count })}</p>
      ) : null}
    </StatCard>
  );
}

// --- Prossime partite ------------------------------------------------------------------

/** Barra impilata 1 / X / 2: la lunghezza di ogni tratto è la probabilità. */
export function ProbabilityBar({ home, draw, away }: { home: number; draw: number; away: number }) {
  const d = getMessages().dashboard;
  const total = home + draw + away || 1;
  const parts = [
    { key: "home", value: home, label: d.home, className: "bg-positive" },
    { key: "draw", value: draw, label: d.draw, className: "bg-muted" },
    { key: "away", value: away, label: d.away, className: "bg-info" },
  ];
  return (
    <div>
      <p className="sr-only">
        {fillTemplate(d.probabilitiesLabel, {
          home: formatPercent(home),
          draw: formatPercent(draw),
          away: formatPercent(away),
        })}
      </p>
      <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-surface-2">
        {parts.map((p) => (
          <span
            key={p.key}
            className={cn("h-full", p.className)}
            style={{ width: `${(p.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between font-mono text-xs text-muted">
        {parts.map((p) => (
          <span key={p.key}>
            {p.label} {formatPercent(p.value, 0)}
          </span>
        ))}
      </div>
    </div>
  );
}

export async function UpcomingMatchesCard({ hasModel }: { hasModel: boolean }) {
  const d = getMessages().dashboard;
  const calendar = await listNextMatches(6).catch(() => null);
  const predictions =
    calendar && hasModel
      ? await listPredictions1x2(calendar.map((r) => r.match_id)).catch(() => [])
      : [];
  const matches = calendar ? withPredictions(calendar, predictions) : [];
  const anyMissing = matches.some((x) => !x.prediction);

  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays size={18} aria-hidden="true" className="text-positive" />
            {d.upcomingTitle}
          </CardTitle>
          <p className="mt-1 text-xs text-muted">{d.upcomingDescription}</p>
          {anyMissing ? (
            <p className="mt-1 text-xs text-muted">
              {hasModel
                ? fillTemplate(d.horizonHint, { days: PREDICTION_HORIZON_DAYS })
                : d.predictionNoModel}
            </p>
          ) : null}
        </div>
        <Link href="/match-center" className="text-sm text-muted hover:text-fg">
          {d.seeAllMatches} →
        </Link>
      </div>
      {matches.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {calendar ? d.upcomingEmpty : d.upcomingUnavailable}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {matches.map((match) => {
            const p = match.prediction;
            const fav = p ? favourite(p) : null;
            return (
              <li key={match.matchId}>
                <Link
                  href={`/match-center/${match.matchId}`}
                  className="-mx-2 grid gap-2 rounded-lg px-2 py-3 hover:bg-surface-2 sm:grid-cols-[1fr_14rem] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      <span className={fav === "HOME" ? "text-positive-strong" : undefined}>
                        {match.home}
                      </span>
                      <span className="text-muted"> – </span>
                      <span className={fav === "AWAY" ? "text-info" : undefined}>{match.away}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{formatDateTime(match.kickoffAt)}</span>
                      <span>· {match.competitionName}</span>
                      {p ? (
                        <Badge tone={confidenceTone(p.confidence)}>
                          {d.confidence} {p.confidence.toFixed(2).replace(".", ",")}
                        </Badge>
                      ) : null}
                    </p>
                  </div>
                  {p ? (
                    <ProbabilityBar home={p.home} draw={p.draw} away={p.away} />
                  ) : (
                    <p className="text-xs text-muted sm:text-right">
                      {hasModel
                        ? fillTemplate(d.predictionFrom, {
                            date: formatDay(predictionExpectedFrom(match.kickoffAt)),
                          })
                        : "–"}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// --- Proposte del Bet Builder -------------------------------------------------------------

export async function ProposalsCard() {
  const m = getMessages();
  const d = m.dashboard;
  const rows = await listActiveProposals().catch(() => null);
  const top = rows ? topProposals(rows) : [];
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Layers size={18} aria-hidden="true" className="text-positive" />
          {d.proposalsTitle}
        </CardTitle>
      </div>
      {rows && rows.length > 0 ? (
        <p className="mt-1 text-xs text-muted">
          {fillTemplate(d.proposalsCount, { n: rows.length })}
        </p>
      ) : null}
      {top.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {rows ? d.proposalsEmpty : d.proposalsUnavailable}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {top.map((p) => (
            <li key={p.proposal_id}>
              <Link
                href={`/bet-builder/${p.proposal_id}`}
                className="block rounded-lg border border-border p-3 hover:border-border-strong hover:bg-surface-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      p.category === "CONSERVATIVE"
                        ? "positive"
                        : p.category === "BALANCED"
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {m.betBuilder.categories[p.category]}
                  </Badge>
                  <span className="text-xs text-muted">
                    {m.betBuilder.kinds[p.kind]} · {p.legs_count} {m.betBuilder.legs.toLowerCase()}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">{d.probability}</dt>
                    <dd className="font-mono">{formatPercent(Number(p.probability))}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{d.price}</dt>
                    <dd className="font-mono">{formatOdds(Number(p.combined_price))}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{d.expectedValue}</dt>
                    <dd
                      className={cn(
                        "font-mono",
                        Number(p.expected_value) >= 0
                          ? "text-positive-strong"
                          : "text-negative-strong",
                      )}
                    >
                      {formatSigned(Number(p.expected_value) * 100, 1)}%
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/bet-builder" className="mt-4 inline-block text-sm text-muted hover:text-fg">
        {d.seeAllProposals} →
      </Link>
    </Card>
  );
}

// --- Esplora ------------------------------------------------------------------------------

const EXPLORE = [
  { key: "matchCenter", href: "/match-center", icon: CalendarDays },
  { key: "marketIntelligence", href: "/markets", icon: TrendingUp },
  { key: "statisticsCenter", href: "/statistics", icon: BarChart3 },
  { key: "betBuilder", href: "/bet-builder", icon: Layers },
  { key: "tracker", href: "/tracker", icon: ListChecks },
  { key: "modelIntelligence", href: "/models", icon: LineChart },
] as const;

export function ExploreGrid() {
  const m = getMessages();
  return (
    <section aria-labelledby="explore-title" className="mt-8">
      <h2 id="explore-title" className="mb-3 text-lg font-semibold">
        {m.dashboard.explore}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EXPLORE.map(({ key, href, icon: Icon }) => (
          <li key={key}>
            <Link
              href={href}
              className="group flex h-full items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <span className="rounded-lg bg-positive-soft p-2 text-positive-strong">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{m.nav[key]}</span>
                <span className="block text-xs text-muted">{m.dashboard.exploreItems[key]}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
