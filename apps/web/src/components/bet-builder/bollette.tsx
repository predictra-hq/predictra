import Link from "next/link";
import { pickLabel } from "@/components/bet-builder/likely";
import { StakeBox } from "@/components/bet-builder/stake-box";
import { stakeBoxLabels } from "@/components/bet-builder/stake-labels";
import { shareProps } from "@/components/community/share-labels";
import { ShareSlip } from "@/components/community/share-slip";
import { pickKey } from "@/lib/community/slip";
import {
  Ticket,
  TICKET_GRID,
  TicketLeg,
  TicketTotals,
  whenAndWhere,
} from "@/components/bet-builder/ticket";
import { Badge } from "@/components/ui/primitives";
import { windowTitle } from "@/components/bet-builder/window-tabs";
import {
  BOLLETTA_PROFILES,
  BOLLETTA_RULES,
  buildBollette,
  oddsAreOld,
  type Bolletta,
  type BollettaProfile,
  type SlipWindow,
  hasPositiveValue,
} from "@/lib/bet-builder/bollette";
import { formatEuro } from "@/components/bankroll/shared";
import { listBankrolls, listLimits, userBookmaker } from "@/lib/bankroll/queries";
import {
  bollettaAdvice,
  bollettaTrackerHref,
  pickAdviceBankroll,
  type AdviceBankroll,
} from "@/lib/bet-builder/register";
import { loadCalibration } from "@/lib/bet-builder/calibration-load";
import { loadPicksData } from "@/lib/bet-builder/queries";
import { listCompetitions } from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";
import { orFallback } from "@/lib/log";

const PROFILE_TONE: Record<BollettaProfile, "positive" | "neutral" | "warning"> = {
  DOUBLE: "positive",
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
  site,
  competitions,
}: {
  competitions: ReadonlyMap<number, string>;
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
  const legs = bolletta.picks.map((p) => (
    <TicketLeg
      key={p.matchId}
      time={whenAndWhere(p, competitions)}
      match={
        <Link href={`/match-center/${p.matchId}`} className="hover:underline">
          {p.home} – {p.away}
        </Link>
      }
      pick={pickLabel(p)}
      probability={`${formatPercent(p.probability, 0)} · ${p.bookmaker}`}
      price={formatOdds(p.price)}
      note={
        p.better ? (
          <span className="text-warning">
            {fillTemplate(m.betterElsewhere, {
              price: formatOdds(p.better.price),
              bookmaker: p.better.bookmaker,
            })}
          </span>
        ) : null
      }
    />
  ));
  return (
    <Ticket
      title={m.profiles[bolletta.profile]}
      badge={
        <Badge tone={PROFILE_TONE[bolletta.profile]}>
          {fillTemplate(m.legs, { n: bolletta.picks.length })}
        </Badge>
      }
      totals={
        <TicketTotals
          priceLabel={m.totalOdds}
          price={formatOdds(bolletta.price)}
          items={[
            { label: m.winProbability, value: formatPercent(bolletta.probability, 0) },
            ...(hasPositiveValue(bolletta)
              ? [
                  {
                    label: m.value,
                    value: formatSignedPercent(bolletta.expectedValue),
                    tone: "positive" as const,
                  },
                ]
              : []),
          ]}
        />
      }
      play={
        <>
          {bankroll && advice ? (
            <p className="mb-2 text-xs text-muted" title={m.adviceHint}>
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
        </>
      }
      footer={
        <>
          <p className={old ? "text-warning" : undefined}>
            {fillTemplate(old ? m.oddsOld : m.oddsRead, {
              at: formatDateTime(bolletta.oddsObservedAt),
            })}
          </p>
          <ShareSlip
            {...shareProps({
              title: m.profiles[bolletta.profile],
              picks: bolletta.picks.map((p) => ({
                match: `${p.home} – ${p.away}`,
                pick: pickLabel(p),
                price: p.price,
                key: pickKey(p),
              })),
              price: bolletta.price,
              probability: bolletta.probability,
            })}
          />
        </>
      }
    >
      {legs}
    </Ticket>
  );
}

/** Profili senza schedina nel periodo (ADR 0072): si dice perché, invece di tacere. */
function MissingProfiles({ present }: { present: readonly Bolletta[] }) {
  const m = getMessages().betBuilder.bollette;
  const missing = BOLLETTA_PROFILES.filter((p) => !present.some((b) => b.profile === p));
  if (missing.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-muted">
      {fillTemplate(m.missing, { profiles: missing.map((p) => `«${m.profiles[p]}»`).join(", ") })}
    </p>
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
  competitions = new Map(),
  window = "round",
}: {
  /** Periodo delle schedine (ADR 0070): turno o giornata. */
  window?: SlipWindow;
  bollette: readonly Bolletta[];
  /** Nomi dei campionati, mostrati sotto le squadre. */
  competitions?: ReadonlyMap<number, string>;
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
            <h3 className="mb-2 mt-3 text-sm text-muted">{windowTitle(window, round)}</h3>
            <div className={TICKET_GRID}>
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
                    competitions={competitions}
                  />
                ))}
            </div>
            <MissingProfiles present={bollette.filter((b) => b.round === round)} />
          </section>
        ))
      )}
      <p className="mt-3 text-xs text-subtle">
        {fillTemplate(m.minimums, {
          solid: formatOdds(BOLLETTA_RULES.SOLID.targetPrice ?? 0),
          balanced: formatOdds(BOLLETTA_RULES.BALANCED.targetPrice ?? 0),
          high: formatOdds(BOLLETTA_RULES.HIGH.targetPrice ?? 0),
        })}{" "}
        {m.note}
      </p>
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
export async function SchedineSection({
  stake,
  window = "round",
}: {
  stake: number | null;
  window?: SlipWindow;
}) {
  const [{ rows, prices, consensus }, bankroll, site, calibration, competitions] =
    await Promise.all([
      loadPicksData(),
      loadAdviceBankroll(),
      userBookmaker(),
      loadCalibration(),
      listCompetitions().catch(orFallback("bet-builder/bollette #1", [])),
    ]);
  return (
    <BolletteCard
      bollette={buildBollette(rows, prices, consensus, calibration, { window })}
      window={window}
      stake={stake}
      now={new Date()}
      bankroll={bankroll}
      site={site?.name ?? null}
      competitions={new Map(competitions.map((c) => [c.id, c.name]))}
    />
  );
}
