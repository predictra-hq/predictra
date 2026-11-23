import type { ReactNode } from "react";
import type { SharedSlip } from "@predictra/shared-types";
import { SlipSummary } from "@/components/community/message";
import { StyledName } from "@/components/community/styled-name";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

const TIME = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Messaggio in una bolla, come nelle app di chat (ADR 0065): i tuoi a destra in verde,
 * quelli degli altri a sinistra. In alto sempre immagine e nome nel loro stile.
 */
export function ChatBubble({
  own,
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
  own: boolean;
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
    <li className={cn("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "min-w-0 rounded-2xl border px-3 py-2",
          slip ? "w-full max-w-sm" : "max-w-[85%] sm:max-w-md",
          own
            ? "rounded-br-md border-positive/40 bg-positive-soft"
            : "rounded-bl-md border-border bg-surface-2",
        )}
      >
        {/* Chi scrive, sempre in alto: immagine e nome nel suo stile, anche nei propri. */}
        <p className="mb-1 flex min-w-0 items-center gap-2 text-xs">
          <UserAvatar style={avatarStyle} name={author} className="size-6" />
          <StyledName
            name={author}
            color={nameColor as never}
            style={nameStyle as never}
            className="truncate font-semibold"
          />
        </p>
        {context ? <div className="mt-0.5 text-xs">{context}</div> : null}
        {body ? <p className="whitespace-pre-line break-words text-sm text-fg">{body}</p> : null}
        {slip ? <SlipSummary slip={slip} /> : null}
        <div className="mt-1 flex items-center justify-end gap-2">
          {actions}
          <time dateTime={createdAt} className="text-[11px] tabular-nums text-subtle">
            {TIME.format(new Date(createdAt))}
          </time>
        </div>
      </div>
    </li>
  );
}

/**
 * Finestra della chat: i messaggi scorrono sopra, il più recente in basso e visibile
 * all'apertura (`flex-col-reverse`), il campo per scrivere resta fisso sotto.
 */
export function ChatThread({
  label,
  empty,
  children,
  composer,
}: {
  label: string;
  /** Testo quando non ci sono messaggi. */
  empty: string | null;
  /** Bolle dal più recente al più vecchio. */
  children: ReactNode;
  composer: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex h-[calc(100dvh-23rem)] min-h-[20rem] flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface lg:h-[calc(100dvh-14rem)]"
    >
      <div className="flex flex-1 flex-col-reverse overflow-y-auto overscroll-contain p-3">
        {empty ? (
          <p className="m-auto max-w-xs text-center text-sm text-muted">{empty}</p>
        ) : (
          <ol className="flex flex-col-reverse gap-2">{children}</ol>
        )}
      </div>
      <div className="border-t border-border bg-surface p-2">{composer}</div>
    </section>
  );
}
