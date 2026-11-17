import Link from "next/link";
import { Target, Trophy } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/primitives";
import { loadVerification, HOME_CERTAINTY_THRESHOLD } from "@/lib/certainties/load";
import { weeklyHits } from "@/lib/certainties/logic";
import { getMessages, getRequestTimeZone } from "@/lib/i18n";
import { listCompetitionSeasons, listLeagueSeasonStats } from "@/lib/odds/queries";
import { fillTemplate } from "@/lib/odds/format";
import { formatPercent } from "@/lib/predictions/format";
import { formatDecimal } from "@/lib/odds/format";

/*
 * Grafici della Home: solo dati reali già presenti in PREDICTRA, disegnati con semplici
 * barre (nessuna libreria). Ogni riquadro sparisce se i suoi dati non ci sono.
 */

const WEEKS = 6;
/** Campionati con meno partite giocate danno percentuali poco affidabili. */
const MIN_LEAGUE_MATCHES = 20;

const weekLabel = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    timeZone: getRequestTimeZone(),
  }).format(new Date(`${iso}T12:00:00Z`));

/** Quante giocate dall'80% sono uscite, settimana per settimana. */
export async function ModelHitsCard() {
  const d = getMessages().dashboard;
  const verification = await loadVerification().catch(() => null);
  if (!verification) return null;
  const weeks = weeklyHits(
    verification.rows,
    verification.results,
    HOME_CERTAINTY_THRESHOLD,
    verification.market,
    WEEKS,
  );
  const count = weeks.reduce((n, w) => n + w.count, 0);
  const wins = weeks.reduce((n, w) => n + w.wins, 0);
  if (count === 0) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Target size={18} aria-hidden="true" className="text-positive" />
          {d.hitsTitle}
        </CardTitle>
        <Link href="/affidabilita" className="text-sm text-muted hover:text-fg">
          {d.hitsMore} →
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        {fillTemplate(d.hitsSummary, {
          wins: String(wins),
          count: String(count),
          rate: formatPercent(wins / count, 0),
          weeks: String(WEEKS),
        })}
      </p>
      <ul className="mt-4 flex h-36 items-end gap-2" aria-label={d.hitsTitle}>
        {weeks.map((w) => {
          const rate = w.count > 0 ? w.wins / w.count : null;
          return (
            <li
              key={w.weekStart}
              className="flex h-full min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span className="font-mono text-xs text-muted">
                {w.count > 0 ? `${w.wins}/${w.count}` : "–"}
              </span>
              <span className="relative w-full flex-1 overflow-hidden rounded-md bg-surface-2">
                {rate !== null ? (
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-md bg-positive"
                    style={{ height: `${Math.max(rate * 100, 4)}%` }}
                  />
                ) : null}
              </span>
              <span className="text-[11px] text-subtle">{weekLabel(w.weekStart)}</span>
              <span className="sr-only">
                {rate !== null
                  ? fillTemplate(d.hitsWeek, {
                      week: weekLabel(w.weekStart),
                      wins: String(w.wins),
                      count: String(w.count),
                    })
                  : fillTemplate(d.hitsWeekEmpty, { week: weekLabel(w.weekStart) })}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-subtle">{d.hitsNote}</p>
    </Card>
  );
}

/** Campionati a confronto: gol medi, partite con più di 2,5 gol e gol di entrambe. */
export async function LeaguesCard() {
  const d = getMessages().dashboard;
  const competitions = await listCompetitionSeasons().catch(() => []);
  const seasonIds = competitions.map((c) => c.seasonId).filter((id): id is number => id !== null);
  const stats = await listLeagueSeasonStats(seasonIds).catch(() => new Map());
  const rows = competitions
    .map((c) => ({ c, s: c.seasonId ? stats.get(c.seasonId) : undefined }))
    .filter((x) => x.s && x.s.matches >= MIN_LEAGUE_MATCHES)
    .map((x) => ({
      code: x.c.code,
      name: x.c.name,
      goals: Number(x.s!.avg_goals),
      over: Number(x.s!.over_2_5_rate),
      btts: Number(x.s!.both_scored_rate),
    }))
    .sort((a, b) => b.goals - a.goals);
  if (rows.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Trophy size={18} aria-hidden="true" className="text-positive" />
          {d.leaguesTitle}
        </CardTitle>
        <Link href="/leagues" className="text-sm text-muted hover:text-fg">
          {d.leaguesMore} →
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">{d.leaguesDescription}</p>
      <div className="mt-3 flex gap-4 text-xs text-muted" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-positive" />
          {d.leaguesOver}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-info" />
          {d.leaguesBtts}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.name}>
            <Link
              href={r.code ? `/leagues?c=${r.code}#campionato` : "/leagues"}
              className="-mx-2 block rounded-lg px-2 py-1 hover:bg-surface-2"
            >
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{r.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {fillTemplate(d.leaguesGoals, { goals: formatDecimal(r.goals) })}
                </span>
              </span>
              <span className="sr-only">
                {fillTemplate(d.leaguesRow, {
                  over: formatPercent(r.over, 0),
                  btts: formatPercent(r.btts, 0),
                })}
              </span>
              <span aria-hidden="true" className="mt-1 flex flex-col gap-1">
                {[
                  { value: r.over, className: "bg-positive" },
                  { value: r.btts, className: "bg-info" },
                ].map((bar, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className={`block h-full rounded-full ${bar.className}`}
                        style={{ width: `${bar.value * 100}%` }}
                      />
                    </span>
                    <span className="w-9 text-right font-mono text-xs text-muted">
                      {formatPercent(bar.value, 0)}
                    </span>
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
