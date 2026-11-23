import type { ReactNode } from "react";
import type { SharedSlip } from "@predictra/shared-types";
import { StyledName } from "@/components/community/styled-name";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { formatOdds, formatPercent } from "@/lib/odds/format";
import { Ticket, TicketLeg, TicketTotals } from "@/components/bet-builder/ticket";

/** Schedina condivisa: lo stesso biglietto delle schedine di PREDICTRA (ADR 0065). */
export function SlipSummary({ slip }: { slip: SharedSlip }) {
  const m = getMessages();
  return (
    <Ticket
      className="mt-2"
      title={slip.title}
      totals={
        slip.price ? (
          <TicketTotals
            priceLabel={m.betBuilder.bollette.totalOdds}
            price={formatOdds(slip.price)}
            items={
              slip.probability
                ? [
                    {
                      label: m.betBuilder.bollette.winProbability,
                      value: formatPercent(slip.probability, 0),
                    },
                  ]
                : []
            }
          />
        ) : undefined
      }
    >
      {slip.picks.map((p, i) => (
        <TicketLeg
          key={i}
          match={p.match}
          pick={p.pick}
          price={p.price ? formatOdds(p.price) : "–"}
        />
      ))}
    </Ticket>
  );
}

/** Messaggio di una chat: immagine del profilo, nome con il suo stile, ora e testo. */
export function Message({
  author,
  avatarStyle,
  nameColor,
  nameStyle,
  createdAt,
  body,
  slip,
  context,
  actions,
}: {
  author: string;
  avatarStyle: string | null;
  nameColor: string | null;
  nameStyle: string | null;
  createdAt: string;
  body: string;
  slip?: SharedSlip | null;
  /** Riga sopra il testo, es. la partita commentata. */
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <UserAvatar style={avatarStyle} name={author} className="size-9" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="text-sm">
            <StyledName
              name={author}
              color={nameColor as never}
              style={nameStyle as never}
              className="font-semibold"
            />
            <span className="ml-2 text-xs text-subtle">{formatDateTime(createdAt)}</span>
          </p>
          {actions}
        </div>
        {context ? <div className="mt-0.5 text-xs">{context}</div> : null}
        {body ? (
          <p className="mt-1 whitespace-pre-line break-words text-sm text-fg">{body}</p>
        ) : null}
        {slip ? <SlipSummary slip={slip} /> : null}
      </div>
    </div>
  );
}
