import type { ReactNode } from "react";
import { SmilePlus } from "lucide-react";
import { REACTION_EMOJIS, type CommunityReaction, type SharedSlip } from "@predictra/shared-types";
import { SlipSummary, type SlipResult } from "@/components/community/message";
import { StyledName } from "@/components/community/styled-name";
import { ReactionPicker } from "@/components/community/reaction-picker";
import { Tooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getRequestTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Giorno e ora del messaggio nel fuso scelto nelle Preferenze. */
function messageTime(createdAt: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: getRequestTimeZone(),
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

/** Nomi di chi ha reagito, al massimo tre, poi «+N». */
function reactedBy(names: readonly string[]): string {
  return names.length <= 3
    ? names.join(", ")
    : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

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
  slipResult,
  context,
  actions,
  reactions,
  anchor,
}: {
  /** Ancora del messaggio (`post-<id>`), per arrivarci dalla Home. */
  anchor?: string;
  /** Esito della schedina condivisa (ADR 0070). */
  slipResult?: SlipResult;
  /** Reazioni con le emoji, sotto il messaggio. */
  reactions?: ReactNode;
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
    <li id={anchor} className={cn("flex scroll-mt-4 flex-col", own ? "items-end" : "items-start")}>
      <div
        className={cn(
          "min-w-0 rounded-2xl border px-3 py-2 [li:target_&]:ring-2 [li:target_&]:ring-positive",
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
        {slip ? <SlipSummary slip={slip} result={slipResult} /> : null}
        <div className="mt-1 flex items-center justify-end gap-2">
          {actions}
          <time dateTime={createdAt} className="text-xs tabular-nums text-subtle">
            {messageTime(createdAt)}
          </time>
        </div>
      </div>
      {reactions}
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
      <div className="flex flex-1 flex-col-reverse overflow-x-hidden overflow-y-auto overscroll-contain p-3">
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

/**
 * Reazioni di un messaggio (ADR 0070): le emoji già usate con il numero di persone (la
 * propria evidenziata, un tocco la toglie) e un pulsante per aggiungerne una. Le vedono
 * tutti. Funziona anche senza JavaScript: ogni emoji è un piccolo modulo.
 */
export function Reactions({
  postId,
  reactions,
  action,
  labels,
  align = "start",
}: {
  postId: number;
  reactions: readonly CommunityReaction[];
  action: (formData: FormData) => Promise<void>;
  labels: { react: string; reactWith: string };
  /** Lato della bolla: la tavolozza si apre verso l'interno della chat, senza uscire. */
  align?: "start" | "end";
}) {
  const button = (
    emoji: string,
    content: ReactNode,
    mine: boolean,
    extra?: string,
    title?: string,
  ) => (
    <form key={emoji} action={action}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="emoji" value={emoji} />
      {/* Chi ha reagito: solo passando con il mouse (o con il focus), con la grafica del sito. */}
      <Tooltip label={title} align={align === "end" ? "end" : "start"}>
        <button
          type="submit"
          aria-label={labels.reactWith.replace("{emoji}", emoji)}
          aria-pressed={mine}
          className={cn(
            "flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors",
            mine
              ? "border-positive/50 bg-positive-soft text-positive-strong"
              : "border-border bg-surface hover:border-border-strong",
            extra,
          )}
        >
          {content}
        </button>
      </Tooltip>
    </form>
  );
  return (
    <div className={cn("mt-1 flex flex-col gap-1", align === "end" ? "items-end" : "items-start")}>
      <div className={cn("flex flex-wrap items-center gap-1", align === "end" && "justify-end")}>
        {reactions.map((r) =>
          button(
            r.emoji,
            <>
              <span aria-hidden="true">{r.emoji}</span>
              {r.count}
            </>,
            r.mine,
            undefined,
            // Passando il mouse: chi l'ha messa (solo i nomi visibili, mai l'email).
            r.names?.length ? reactedBy(r.names) : undefined,
          ),
        )}
        <ReactionPicker
          summary={<SmilePlus size={16} aria-hidden="true" />}
          summaryLabel={labels.react}
          className={cn(
            "absolute bottom-10 z-10 grid w-max grid-cols-4 gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {REACTION_EMOJIS.map((e) =>
            button(
              e,
              <span aria-hidden="true">{e}</span>,
              reactions.some((r) => r.emoji === e && r.mine),
              "border-transparent bg-transparent text-base",
            ),
          )}
        </ReactionPicker>
      </div>
    </div>
  );
}
