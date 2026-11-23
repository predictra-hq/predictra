import type { ReactNode } from "react";
import type { SharedSlip } from "@predictra/shared-types";
import { StyledName } from "@/components/community/styled-name";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";

/** Schedina condivisa: titolo, una riga per partita, quota e probabilità. */
export function SlipSummary({ slip }: { slip: SharedSlip }) {
  const m = getMessages().community;
  return (
    <div className="mt-2 rounded-xl border border-border bg-surface-2 p-3">
      <p className="text-sm font-semibold">{slip.title}</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-sm">
        {slip.picks.map((p, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="block font-medium">{p.pick}</span>
              <span className="block truncate text-xs text-muted">{p.match}</span>
            </span>
            {p.price ? <span className="shrink-0 tabular-nums">{formatOdds(p.price)}</span> : null}
          </li>
        ))}
      </ul>
      {slip.price || slip.probability ? (
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
          {[
            slip.price ? fillTemplate(m.slipPrice, { price: formatOdds(slip.price) }) : null,
            slip.probability
              ? fillTemplate(m.slipProbability, { p: formatPercent(slip.probability, 0) })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </div>
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
