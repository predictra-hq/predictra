import Link from "next/link";
import { pickLabel } from "@/components/bet-builder/likely";
import { StakeSimulation } from "@/components/bet-builder/shared";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import {
  buildBollette,
  oddsAreOld,
  type Bolletta,
  type BollettaProfile,
} from "@/lib/bet-builder/bollette";
import { formatEuro } from "@/components/bankroll/shared";
import { listBankrolls, listLimits } from "@/lib/bankroll/queries";
import { formatRound } from "@/lib/bet-builder/format";
import {
  bollettaAdvice,
  bollettaTrackerHref,
  pickAdviceBankroll,
  type AdviceBankroll,
} from "@/lib/bet-builder/register";
import { loadPicksData } from "@/lib/bet-builder/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";

const PROFILE_TONE: Record<BollettaProfile, "positive" | "neutral" | "warning"> = {
  SOLID: "positive",
  BALANCED: "neutral",
  HIGH: "warning",
};

/** Puntata d'esempio quando l'utente non ne ha indicata una. */
const EXAMPLE_STAKE = 10;

/** "+4,2%" / "−1,5%": valore atteso per 1 € puntato. */
function formatSignedPercent(value: number): string {
  const text = formatPercent(Math.abs(value));
  return value >= 0 ? `+${text}` : `−${text}`;
}

function BollettaCard({
  bolletta,
  stake,
  now,
  bankroll,
}: {
  bolletta: Bolletta;
  stake: number | null;
  now: Date;
  bankroll: AdviceBankroll | null;
}) {
  const m = getMessages().betBuilder.bollette;
  const old = oddsAreOld(bolletta, now);
  const advice = bankroll ? bollettaAdvice(bolletta, bankroll) : null;
  const advised = advice?.kelly ? advice.kelly : null;
  // Puntata mostrata e passata al Tracker: quella scelta dall'utente, altrimenti la consigliata.
  const playStake = stake ?? advised;
  return (
    <article className="flex flex-col rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{m.profiles[bolletta.profile]}</h4>
        <Badge tone={PROFILE_TONE[bolletta.profile]}>
          {fillTemplate(m.legs, { n: bolletta.picks.length })}
        </Badge>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <dt className="text-xs text-muted">{m.totalOdds}</dt>
          <dd className="font-mono text-lg font-semibold text-positive-strong">
            {formatOdds(bolletta.price)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <dt className="text-xs text-muted">{m.winProbability}</dt>
          <dd className="font-mono text-lg font-semibold">{formatPercent(bolletta.probability)}</dd>
        </div>
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <dt className="text-xs text-muted" title={m.valueHint}>
            {m.value}
          </dt>
          <dd
            className={`font-mono text-lg font-semibold ${
              bolletta.expectedValue >= 0 ? "text-positive-strong" : "text-muted"
            }`}
          >
            {formatSignedPercent(bolletta.expectedValue)}
          </dd>
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
              <span className="block text-xs text-muted">
                {formatPercent(p.probability, 0)} · {m.valueShort} {formatSignedPercent(p.edge)}
              </span>
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
          stake={playStake ?? EXAMPLE_STAKE}
          price={bolletta.price}
          probability={bolletta.probability}
        />
      </div>
      {bankroll && advice ? (
        <p className="mt-2 text-xs text-muted" title={m.adviceHint}>
          {advised !== null
            ? fillTemplate(m.advice, { name: bankroll.name, stake: formatEuro(advised) })
            : fillTemplate(m.adviceNone, { name: bankroll.name })}
          {advised !== null && advice.cappedByLimit ? ` (${m.adviceCapped})` : ""}
        </p>
      ) : null}
      <Link
        href={bollettaTrackerHref(
          bolletta,
          {
            market: m.registerMarket,
            selection: fillTemplate(m.registerSelection, {
              profile: m.profiles[bolletta.profile],
              n: bolletta.picks.length,
            }),
          },
          playStake,
        )}
        title={m.registerHint}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium hover:bg-border"
      >
        {m.register}
      </Link>
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
  bankroll = null,
}: {
  bollette: readonly Bolletta[];
  stake?: number | null;
  /** Bankroll dell'utente su cui calcolare la puntata consigliata, se ne ha uno. */
  bankroll?: AdviceBankroll | null;
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
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {bollette
                .filter((b) => b.round === round)
                .map((b) => (
                  <BollettaCard
                    key={`${round}-${b.profile}`}
                    bolletta={b}
                    stake={stake}
                    now={now}
                    bankroll={bankroll}
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

/**
 * Bankroll di riferimento dell'utente (solo i propri dati, tramite RLS). Se la lettura
 * fallisce le schedine si vedono lo stesso, senza puntata consigliata.
 */
async function loadAdviceBankroll(): Promise<AdviceBankroll | null> {
  try {
    const [bankrolls, limits] = await Promise.all([listBankrolls(), listLimits()]);
    const chosen = pickAdviceBankroll(bankrolls);
    if (!chosen) return null;
    return {
      name: chosen.name,
      available: Number(chosen.available),
      flatPct: Number(chosen.flat_stake_pct),
      limits: limits.find((l) => l.bankroll_id === chosen.bankroll_id) ?? null,
    };
  } catch {
    return null;
  }
}

/** Sezione asincrona: legge previsioni e quote e mostra le schedine consigliate. */
export async function SchedineSection({ stake }: { stake: number | null }) {
  const [{ rows, prices, consensus }, bankroll] = await Promise.all([
    loadPicksData(),
    loadAdviceBankroll(),
  ]);
  return (
    <BolletteCard
      bollette={buildBollette(rows, prices, consensus)}
      stake={stake}
      now={new Date()}
      bankroll={bankroll}
    />
  );
}
