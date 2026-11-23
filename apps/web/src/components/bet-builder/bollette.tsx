import Link from "next/link";
import { pickLabel } from "@/components/bet-builder/likely";
import { StakeBox } from "@/components/bet-builder/stake-box";
import { stakeBoxLabels } from "@/components/bet-builder/stake-labels";
import { shareProps } from "@/components/community/share-labels";
import { ShareSlip } from "@/components/community/share-slip";
import { Badge } from "@/components/ui/primitives";
import {
  buildBollette,
  oddsAreOld,
  type Bolletta,
  type BollettaProfile,
} from "@/lib/bet-builder/bollette";
import { formatEuro } from "@/components/bankroll/shared";
import { listBankrolls, listLimits, userBookmaker } from "@/lib/bankroll/queries";
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
  DOUBLE: "positive",
  SOLID: "positive",
  BALANCED: "neutral",
  LONG: "neutral",
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
  site,
}: {
  bolletta: Bolletta;
  stake: number | null;
  now: Date;
  bankroll: AdviceBankroll | null;
  site: string | null;
}) {
  const m = getMessages().betBuilder.bollette;
  const old = oddsAreOld(bolletta, now);
  const advice = bankroll ? bollettaAdvice(bolletta, bankroll) : null;
  const advised = advice?.kelly ? advice.kelly : null;
  // Puntata mostrata e passata al Tracker: quella scelta dall'utente, altrimenti la consigliata.
  const playStake = stake ?? advised;
  return (
    <article className="flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-base font-semibold">{m.profiles[bolletta.profile]}</h4>
        <Badge tone={PROFILE_TONE[bolletta.profile]}>
          {fillTemplate(m.legs, { n: bolletta.picks.length })}
        </Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <dt className="text-xs text-muted">{m.totalOdds}</dt>
          <dd className="font-mono text-2xl font-semibold text-positive-strong">
            {formatOdds(bolletta.price)}
          </dd>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <dt className="text-xs text-muted">{m.winProbability}</dt>
          <dd className="font-mono text-2xl font-semibold">
            {formatPercent(bolletta.probability, 0)}
          </dd>
        </div>
      </dl>
      {bolletta.expectedValue >= 0 ? (
        <p className="mt-2 text-xs text-positive-strong" title={m.valueHint}>
          {m.value} {formatSignedPercent(bolletta.expectedValue)}
        </p>
      ) : null}

      <ol className="mt-2 flex-1 divide-y divide-border text-sm">
        {bolletta.picks.map((p) => (
          <li key={p.matchId} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <Link
                href={`/match-center/${p.matchId}`}
                className="block truncate font-medium hover:underline"
              >
                {p.home} – {p.away}
              </Link>
              <span className="block text-positive-strong">{pickLabel(p)}</span>
              <span className="block truncate text-xs text-muted">
                {formatDateTime(p.kickoffAt)} · {p.bookmaker}
              </span>
              {p.better ? (
                <span className="block truncate text-xs text-warning">
                  {fillTemplate(m.betterElsewhere, {
                    price: formatOdds(p.better.price),
                    bookmaker: p.better.bookmaker,
                  })}
                </span>
              ) : null}
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
      {bankroll && advice ? (
        <p className="mt-2 text-xs text-muted" title={m.adviceHint}>
          {advised !== null
            ? fillTemplate(m.advice, { name: bankroll.name, stake: formatEuro(advised) })
            : fillTemplate(m.adviceNone, { name: bankroll.name })}
          {advised !== null && advice.cappedByLimit ? ` (${m.adviceCapped})` : ""}
        </p>
      ) : null}
      <StakeBox
        defaultStake={Math.max(1, Math.floor(playStake ?? EXAMPLE_STAKE))}
        price={bolletta.price}
        site={site}
        registerHref={bollettaTrackerHref(
          bolletta,
          {
            market: m.registerMarket,
            selection: fillTemplate(m.registerSelection, {
              profile: m.profiles[bolletta.profile],
              n: bolletta.picks.length,
            }),
          },
          null,
        )}
        labels={stakeBoxLabels()}
      />
      <div className="mt-3">
        <ShareSlip
          {...shareProps({
            title: m.profiles[bolletta.profile],
            picks: bolletta.picks.map((p) => ({
              match: `${p.home} – ${p.away}`,
              pick: pickLabel(p),
              price: p.price,
            })),
            price: bolletta.price,
            probability: bolletta.probability,
          })}
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
  bankroll = null,
  site = null,
}: {
  bollette: readonly Bolletta[];
  /** Sito del bankroll di riferimento, se indicato. */
  site?: string | null;
  stake?: number | null;
  /** Bankroll dell'utente su cui calcolare la puntata consigliata, se ne ha uno. */
  bankroll?: AdviceBankroll | null;
  /** Istante della richiesta: serve a dire se le quote sono da ricontrollare. */
  now: Date;
}) {
  const m = getMessages().betBuilder.bollette;
  const rounds = [...new Set(bollette.map((b) => b.round))].sort();
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">{m.title}</h2>
      <p className="mt-1 hidden text-sm text-muted sm:block">{m.description}</p>
      {bollette.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{m.empty}</p>
      ) : (
        rounds.map((round) => (
          <section key={round}>
            <h3 className="mb-2 mt-3 text-sm text-muted">
              {fillTemplate(m.round, { round: formatRound(round) })}
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {bollette
                .filter((b) => b.round === round)
                .map((b) => (
                  <BollettaCard
                    key={`${round}-${b.profile}`}
                    bolletta={b}
                    stake={stake}
                    now={now}
                    bankroll={bankroll}
                    site={site}
                  />
                ))}
            </div>
          </section>
        ))
      )}
      <p className="mt-3 text-xs text-subtle">{m.note}</p>
    </section>
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
  const [{ rows, prices, consensus }, bankroll, site] = await Promise.all([
    loadPicksData(),
    loadAdviceBankroll(),
    userBookmaker(),
  ]);
  return (
    <BolletteCard
      bollette={buildBollette(rows, prices, consensus)}
      stake={stake}
      now={new Date()}
      bankroll={bankroll}
      site={site?.name ?? null}
    />
  );
}
