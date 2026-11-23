import type { Metadata } from "next";
import Link from "next/link";
import { Check, Circle, X } from "lucide-react";
import { pickLabel } from "@/components/bet-builder/likely";
import { shareProps } from "@/components/community/share-labels";
import { ShareSlip } from "@/components/community/share-slip";
import { BetBuilderDisclaimer, BetBuilderNav } from "@/components/bet-builder/shared";
import { Ticket, TicketLeg, TicketTotals } from "@/components/bet-builder/ticket";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { formatRound } from "@/lib/bet-builder/format";
import { loadPastRounds } from "@/lib/bet-builder/past-load";
import type { PastOutcome } from "@/lib/bet-builder/past";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";

export const metadata: Metadata = { title: "Passate — Schedine" };

const TONE: Record<PastOutcome, "positive" | "negative" | "neutral"> = {
  WON: "positive",
  LOST: "negative",
  PENDING: "neutral",
};

/** Schedine consigliate dei turni già iniziati, con l'esito di ogni partita (ADR 0062). */
export default async function PastSlipsPage() {
  await requireUser();
  const m = getMessages().betBuilder;
  const p = m.past;
  const profiles = m.bollette.profiles;
  const rounds = await loadPastRounds();

  return (
    <>
      <PageHeader title={p.title} description={p.description} />
      <BetBuilderNav current="past" />

      {rounds.length === 0 ? (
        <EmptyState>{p.empty}</EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {rounds.map((r) => (
            <section key={r.round} aria-labelledby={`turno-${r.round}`}>
              <h2 id={`turno-${r.round}`} className="text-lg font-semibold">
                {fillTemplate(p.round, { round: formatRound(r.round) })}
              </h2>
              <p className="mb-3 text-sm text-muted">
                {r.settled === 0
                  ? p.summaryNone
                  : fillTemplate(p.summary, { won: r.won, settled: r.settled })}
              </p>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {r.bollette.map((b) => (
                  <li key={`${b.bolletta.profile}-${b.bolletta.round}`}>
                    <Ticket
                      className="h-full"
                      title={profiles[b.bolletta.profile]}
                      badge={<Badge tone={TONE[b.outcome]}>{p.outcome[b.outcome]}</Badge>}
                      totals={
                        <TicketTotals
                          priceLabel={m.bollette.totalOdds}
                          price={formatOdds(b.bolletta.price)}
                          items={[
                            {
                              label: m.bollette.winProbability,
                              value: formatPercent(b.bolletta.probability, 0),
                            },
                          ]}
                        />
                      }
                      footer={
                        <ShareSlip
                          {...shareProps({
                            title: `${profiles[b.bolletta.profile]} · ${p.outcome[b.outcome]}`,
                            picks: b.legs.map((l) => ({
                              match: `${l.pick.home} – ${l.pick.away}${l.score ? ` ${l.score}` : ""}`,
                              pick: pickLabel(l.pick),
                              price: l.pick.price,
                            })),
                            price: b.bolletta.price,
                            probability: b.bolletta.probability,
                          })}
                        />
                      }
                    >
                      {b.legs.map((l) => (
                        <TicketLeg
                          key={`${l.pick.matchId}-${l.pick.market}-${l.pick.selection}`}
                          time={formatDateTime(l.pick.kickoffAt)}
                          match={
                            <Link
                              href={`/match-center/${l.pick.matchId}`}
                              className="hover:underline"
                            >
                              {l.pick.home} – {l.pick.away}
                            </Link>
                          }
                          pick={pickLabel(l.pick)}
                          price={formatOdds(l.pick.price)}
                          status={
                            <span className="flex items-center gap-1.5">
                              {l.score ? (
                                <span className="font-mono text-xs tabular-nums text-muted">
                                  {l.score}
                                </span>
                              ) : null}
                              {l.won === true ? (
                                <Check
                                  size={18}
                                  className="text-positive-strong"
                                  aria-label={p.legWon}
                                />
                              ) : l.won === false ? (
                                <X
                                  size={18}
                                  className="text-negative-strong"
                                  aria-label={p.legLost}
                                />
                              ) : (
                                <Circle
                                  size={14}
                                  className="text-subtle"
                                  aria-label={p.legPending}
                                />
                              )}
                            </span>
                          }
                        />
                      ))}
                    </Ticket>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-subtle">{p.note}</p>
      <p className="mt-2 text-sm">
        <Link href="/bet-builder/results" className="text-positive-strong hover:underline">
          {p.stats} →
        </Link>
      </p>
      <BetBuilderDisclaimer />
    </>
  );
}
