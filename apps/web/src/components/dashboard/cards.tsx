import { settleOpenBets } from "@/lib/bankroll/settle";
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
import { healthTone, overallHealth } from "@/components/agent/status";
import { FreshnessBadge } from "@/components/football/badges";
import { getAgentStatus } from "@/lib/agent/queries";
import { pickLabel } from "@/components/bet-builder/likely";
import { cookies } from "next/headers";
import { ALERT_COOKIE, parseAlertThreshold, soonPicks } from "@/lib/alerts";
import { buildBollette, hasPositiveValue, oddsAreOld } from "@/lib/bet-builder/bollette";
import { loadCalibration } from "@/lib/bet-builder/calibration-load";
import { loadHomeCertainties } from "@/lib/certainties/load";
import { listActiveProposals, loadPicksData } from "@/lib/bet-builder/queries";
import { getSourceHealth } from "@/lib/football/queries";
import {
  bankrollTotals,
  favourite,
  PREDICTION_HORIZON_DAYS,
  predictionExpectedFrom,
  topProposals,
  withPredictions,
} from "@/lib/dashboard/summary";
import { listNextMatches, listPredictions1x2 } from "@/lib/dashboard/queries";
import { formatDateTime, getMessages, getRequestTimeZone } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatSigned } from "@/lib/odds/format";
import { confidenceTone, formatPercent } from "@/lib/predictions/format";
import { confidenceBand } from "@predictra/shared-types";
import { hasActiveModel, listModelVersions } from "@/lib/predictions/queries";
import { cn } from "@/lib/utils";
import { orFallback } from "@/lib/log";

const formatDay = (d: Date) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    timeZone: getRequestTimeZone(),
  }).format(d);

/** Etichetta piccola in maiuscolo in cima ai riquadri. */
function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-xs uppercase tracking-wide text-muted">{children}</p>;
}

/** Riquadro-indicatore con link: tutto il riquadro è cliccabile. */
export function StatCard({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_1px_2px_rgb(0_0_0/0.4)] transition-colors hover:border-positive/40 hover:bg-surface-2"
    >
      <div className="flex items-center justify-between">
        <Kicker>{title}</Kicker>
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="text-subtle transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-positive-strong"
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
  const versions = await listModelVersions().catch(orFallback("dashboard/cards #1", null));
  const active = versions?.find((v) => v.status === "ACTIVE") ?? null;
  return (
    <StatCard href="/models" title={d.activeModel}>
      {active ? (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-lg font-semibold">
            {m.modelIntelligence.modelNames[active.model_key]}
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
  // Chiude le giocate le cui partite sono finite, così il saldo è aggiornato.
  await settleOpenBets();
  const rows = await listBankrolls().catch(orFallback("dashboard/cards #2", null));
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
      <p className="mt-1 text-xs text-muted">
        {fillTemplate(d.bankrollLine, { available: formatEuro(t.available), open: t.openBets })}
      </p>
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

export async function UpcomingMatchesCard() {
  const d = getMessages().dashboard;
  const [calendar, hasModel] = await Promise.all([
    listNextMatches(6).catch(orFallback("dashboard/cards #3", null)),
    hasActiveModel().catch(orFallback("dashboard/cards #4", false)),
  ]);
  const predictions =
    calendar && hasModel
      ? await listPredictions1x2(calendar.map((r) => r.match_id)).catch(
          orFallback("dashboard/cards #5", []),
        )
      : [];
  const matches = calendar ? withPredictions(calendar, predictions) : [];
  const anyMissing = matches.some((x) => !x.prediction);

  return (
    <Card>
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
                  className="-mx-2 grid grid-cols-1 gap-2 rounded-lg px-2 py-3 hover:bg-surface-2 sm:grid-cols-[1fr_14rem] sm:items-center"
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
                          {d.confidenceWords[confidenceBand(p.confidence)]}
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
  const rows = await listActiveProposals().catch(orFallback("dashboard/cards #6", null));
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
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EXPLORE.map(({ key, href, icon: Icon }) => (
          <li key={key}>
            <Link
              href={href}
              className="group flex h-full items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-positive/40 hover:bg-surface-2"
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

// --- Schedine consigliate (ADR 0037) -------------------------------------------------

async function loadBollette() {
  const [{ rows, prices, consensus }, calibration] = await Promise.all([
    loadPicksData(),
    loadCalibration(),
  ]);
  return buildBollette(rows, prices, consensus, calibration);
}

/** Le schedine consigliate del turno più vicino, in breve: il dettaglio è nella pagina. */
export async function SchedineCard() {
  const d = getMessages().dashboard;
  const s = getMessages().betBuilder.bollette;
  const bollette = await loadBollette().catch(orFallback("dashboard/cards #7", null));
  const round = bollette?.[0]?.round ?? null;
  const shown = round ? (bollette ?? []).filter((b) => b.round === round) : [];

  return (
    <StatCard href="/bet-builder" title={s.title}>
      {bollette === null ? (
        <p className="mt-2 text-sm text-muted">{d.noData}</p>
      ) : shown.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{d.schedineEmpty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {shown.map((b) => (
            <li key={b.profile} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">
                {s.profiles[b.profile]}{" "}
                <span className="whitespace-nowrap text-xs text-muted">
                  · {fillTemplate(s.legs, { n: b.picks.length })}
                </span>
              </span>
              <span className="text-right font-mono">
                <span className="font-semibold text-positive-strong">{formatOdds(b.price)}</span>{" "}
                <span className="text-xs text-muted">{formatPercent(b.probability, 0)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </StatCard>
  );
}

// --- Stato del sistema ---------------------------------------------------------------

/** Modello attivo, freschezza dei dati e (per chi può vederlo) stato dell'agente in un riquadro. */
export async function SystemStatusCard({ canMonitor }: { canMonitor: boolean }) {
  const m = getMessages();
  const d = m.dashboard;
  const [versions, sources, agent] = await Promise.all([
    listModelVersions().catch(orFallback("dashboard/cards #8", null)),
    getSourceHealth().catch(orFallback("dashboard/cards #9", null)),
    canMonitor
      ? getAgentStatus().catch(orFallback("dashboard/cards #10", null))
      : Promise.resolve(null),
  ]);
  const active = versions?.find((v) => v.status === "ACTIVE") ?? null;
  // Freschezza dei dati in uso: la fonte più aggiornata tra quelle con termini verificati.
  const verified = (sources ?? []).filter((x) => x.terms_verified_at && x.last_success_at);
  verified.sort((a, b) => (b.last_success_at ?? "").localeCompare(a.last_success_at ?? ""));
  const latest = verified[0] ?? null;
  const health = agent ? overallHealth(agent) : null;

  return (
    <StatCard href="/models" title={d.systemTitle}>
      <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-xs text-muted">{d.activeModel}</dt>
        <dd className="text-right">
          {active ? m.modelIntelligence.modelNames[active.model_key] : d.noActiveModel}
        </dd>
        <dt className="text-xs text-muted">{d.dataFreshness}</dt>
        <dd className="text-right">
          {latest ? <FreshnessBadge freshness={latest.freshness ?? null} /> : d.noData}
        </dd>
        {health ? (
          <>
            <dt className="text-xs text-muted">{d.agentStatus}</dt>
            <dd className="text-right">
              <Badge tone={healthTone(health)}>{m.agent.health[health]}</Badge>
            </dd>
          </>
        ) : null}
      </dl>
      {latest?.last_success_at ? (
        <p className="mt-2 text-xs text-muted">
          {d.lastUpdate}: {formatDateTime(latest.last_success_at)}
        </p>
      ) : null}
    </StatCard>
  );
}

// --- Avvisi --------------------------------------------------------------------------

/**
 * "Da non perdere": ciò che richiede attenzione adesso. Giocate sopra la soglia scelta
 * nelle Preferenze che iniziano entro 36 ore, schedine con valore del prossimo turno,
 * giocate appena chiuse dai risultati e giocate ancora aperte. Senza nulla da dire il
 * riquadro non compare.
 */
export async function AlertsCard() {
  const d = getMessages().dashboard;
  const s = getMessages().betBuilder.bollette;
  const threshold = parseAlertThreshold((await cookies()).get(ALERT_COOKIE)?.value);
  const now = new Date();
  const [picks, bollette, settled, bankrolls] = await Promise.all([
    loadHomeCertainties().catch(orFallback("dashboard/cards #11", [])),
    loadBollette().catch(orFallback("dashboard/cards #12", [])),
    settleOpenBets(),
    listBankrolls().catch(orFallback("dashboard/cards #13", [])),
  ]);
  const soon = soonPicks(picks, now, threshold).slice(0, 4);
  const soonEnd = now.getTime() + 48 * 3_600_000;
  const valuable = bollette
    .filter(
      (b) =>
        hasPositiveValue(b) &&
        b.picks.some((p) => new Date(p.kickoffAt).getTime() <= soonEnd) &&
        !oddsAreOld(b, now),
    )
    .sort((a, b) => b.probability - a.probability)[0];
  const openBets = bankrolls.reduce((sum, b) => sum + Number(b.open_bets), 0);
  const closed = settled.won + settled.lost;
  if (soon.length === 0 && !valuable && openBets === 0 && closed === 0) return null;

  const row = "flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm";
  return (
    <Card className="mb-4 border-positive/30">
      <Kicker>{d.alertsTitle}</Kicker>
      <ul className="mt-2 flex flex-col gap-2">
        {closed > 0 ? (
          <li>
            <Link href="/tracker" className={cn(row, "hover:bg-border")}>
              {fillTemplate(d.alertsSettled, { won: settled.won, lost: settled.lost })}
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-subtle" />
            </Link>
          </li>
        ) : null}
        {soon.length > 0 ? (
          <li>
            <p className="mb-1 text-xs text-muted">
              {fillTemplate(d.alertsSoon, { n: threshold })}
            </p>
            <ul className="flex flex-col gap-1.5">
              {soon.map((p) => (
                <li key={p.matchId}>
                  <Link href={`/match-center/${p.matchId}`} className={cn(row, "hover:bg-border")}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {p.home} – {p.away}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {formatDateTime(p.kickoffAt)} · {pickLabel(p)}
                      </span>
                    </span>
                    <span className="font-mono text-base font-semibold text-positive-strong">
                      {formatPercent(p.probability, 0)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        {valuable ? (
          <li>
            <Link href="/bet-builder" className={cn(row, "hover:bg-border")}>
              <span className="min-w-0 truncate">
                {fillTemplate(d.alertsSchedina, { profile: s.profiles[valuable.profile] })}
              </span>
              <span className="shrink-0 font-mono">
                <span className="font-semibold text-positive-strong">
                  {formatOdds(valuable.price)}
                </span>{" "}
                <span className="text-xs text-muted">{formatPercent(valuable.probability, 0)}</span>
              </span>
            </Link>
          </li>
        ) : null}
        {openBets > 0 ? (
          <li>
            <Link href="/tracker" className={cn(row, "hover:bg-border")}>
              {fillTemplate(d.alertsOpenBets, { n: openBets })}
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-subtle" />
            </Link>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}

// --- Certezze ------------------------------------------------------------------------

/** Le giocate più probabili delle prossimi 7 giorni (probabilità combinata modello/mercato). */
export async function CertaintiesCard() {
  const d = getMessages().dashboard;
  const picks = await loadHomeCertainties().catch(orFallback("dashboard/cards #14", null));
  const best = picks?.[0];

  return (
    <StatCard href="/certainties" title={d.certaintiesTitle}>
      {picks === null ? (
        <p className="mt-2 text-sm text-muted">{d.noData}</p>
      ) : picks.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{d.certaintiesEmpty}</p>
      ) : (
        <>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{picks.length}</p>
          <p className="text-xs text-muted">{d.certaintiesCount}</p>
          {best ? (
            <p className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {best.home} – {best.away}
                </span>
                <span className="block truncate text-xs text-muted">{pickLabel(best)}</span>
              </span>
              <span className="font-mono text-base font-semibold text-positive-strong">
                {formatPercent(best.probability, 0)}
              </span>
            </p>
          ) : null}
        </>
      )}
    </StatCard>
  );
}
