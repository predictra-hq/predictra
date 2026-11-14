import Link from "next/link";
import { pickLabel } from "@/components/bet-builder/likely";
import { StakeSimulation } from "@/components/bet-builder/shared";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import {
  BOLLETTA_RULES,
  oddsAreOld,
  type Bolletta,
  type BollettaProfile,
} from "@/lib/bet-builder/bollette";
import { formatRound } from "@/lib/bet-builder/format";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";

const PROFILE_TONE: Record<BollettaProfile, "positive" | "neutral" | "warning"> = {
  SOLID: "positive",
  BALANCED: "neutral",
  HIGH: "warning",
};

/** Puntata d'esempio quando l'utente non ne ha indicata una. */
const EXAMPLE_STAKE = 10;

function BollettaCard({
  bolletta,
  stake,
  now,
}: {
  bolletta: Bolletta;
  stake: number | null;
  now: Date;
}) {
  const m = getMessages().betBuilder.bollette;
  const rule = BOLLETTA_RULES[bolletta.profile];
  const old = oddsAreOld(bolletta, now);
  return (
    <article className="flex flex-col rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{m.profiles[bolletta.profile]}</h4>
        <Badge tone={PROFILE_TONE[bolletta.profile]}>
          {fillTemplate(m.legs, { n: bolletta.picks.length })}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {fillTemplate(m.profileHint, {
          p: formatPercent(rule.minProbability, 0),
          price: formatOdds(rule.minPrice),
        })}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <dt className="text-xs text-muted">{m.totalOdds}</dt>
          <dd className="font-mono text-xl font-semibold text-positive-strong">
            {formatOdds(bolletta.price)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <dt className="text-xs text-muted">{m.winProbability}</dt>
          <dd className="font-mono text-xl font-semibold">{formatPercent(bolletta.probability)}</dd>
        </div>
      </dl>

      <ol className="mt-3 flex-1 text-sm">
        {bolletta.picks.map((p) => (
          <li
            key={p.matchId}
            className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0"
          >
            <span className="min-w-0">
              <Link href={`/match-center/${p.matchId}`} className="font-medium hover:underline">
                {p.home} – {p.away}
              </Link>
              <span className="block">{pickLabel(p)}</span>
              <span className="block text-xs text-muted">
                {formatDateTime(p.kickoffAt)} · {p.bookmaker}
              </span>
            </span>
            <span className="shrink-0 text-right font-mono">
              <span className="block text-base font-semibold">{formatOdds(p.price)}</span>
              <span className="block text-xs text-muted">{formatPercent(p.probability, 0)}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className={`mt-3 text-xs ${old ? "text-warning" : "text-muted"}`}>
        {fillTemplate(old ? m.oddsOld : m.oddsRead, {
          at: formatDateTime(bolletta.oddsObservedAt),
        })}
      </p>
      <div className="mt-2">
        <StakeSimulation
          stake={stake ?? EXAMPLE_STAKE}
          price={bolletta.price}
          probability={bolletta.probability}
        />
      </div>
    </article>
  );
}

/**
 * Bollette consigliate per turno: una multipla giocabile per profilo, con quote reali
 * di bookmaker italiani. Nessuna bolletta se le selezioni valide non bastano.
 */
export function BolletteCard({
  bollette,
  stake = null,
  now,
}: {
  bollette: readonly Bolletta[];
  stake?: number | null;
  /** Istante della richiesta: serve a dire se le quote sono da ricontrollare. */
  now: Date;
}) {
  const m = getMessages().betBuilder.bollette;
  const rounds = [...new Set(bollette.map((b) => b.round))].sort();
  return (
    <Card className="mb-6">
      <CardTitle>{m.title}</CardTitle>
      <p className="mt-1 text-sm text-muted">{m.description}</p>
      {bollette.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{m.empty}</p>
      ) : (
        rounds.map((round) => (
          <section key={round}>
            <h3 className="mb-2 mt-4 text-sm font-semibold">
              {fillTemplate(m.round, { round: formatRound(round) })}
            </h3>
            <div className="grid gap-3 lg:grid-cols-3">
              {bollette
                .filter((b) => b.round === round)
                .map((b) => (
                  <BollettaCard
                    key={`${round}-${b.profile}`}
                    bolletta={b}
                    stake={stake}
                    now={now}
                  />
                ))}
            </div>
          </section>
        ))
      )}
      <p className="mt-4 text-xs text-muted">{m.note}</p>
    </Card>
  );
}
