import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/*
 * Schedina disegnata come un biglietto (ADR 0065), in versione compatta (ADR 0067):
 * intestazione su una riga con il simbolo di PREDICTRA, una riga per partita con esito e
 * quota, uno strappo tratteggiato con due tacche, i totali. Puntata e «L'ho giocata» stanno
 * in un pannello che si apre solo se serve. La usano tutte le viste con schedine.
 */

/** Griglia delle schedine: al massimo 3 per riga, così si leggono bene. */
export const TICKET_GRID = "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3";

export function Ticket({
  title,
  badge,
  children,
  totals,
  play,
  footer,
  className,
}: {
  title: ReactNode;
  badge?: ReactNode;
  /** Righe delle partite (`TicketLeg`). */
  children: ReactNode;
  /** Totali sotto lo strappo (`TicketTotals`). */
  totals?: ReactNode;
  /** Puntata e registrazione, in un pannello chiuso («Gioca»). */
  play?: ReactNode;
  /** Note brevi e condivisione. */
  footer?: ReactNode;
  className?: string;
}) {
  const m = getMessages().betBuilder;
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.25)]",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-dashed border-border bg-positive-soft/60 px-3.5 py-2">
        <Logo className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-semibold uppercase tracking-[0.18em] text-positive-strong">
            {m.ticketLabel}
          </p>
          <h4 className="truncate text-sm font-semibold leading-tight">{title}</h4>
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </header>
      <ol className="flex-1 px-3.5">{children}</ol>
      {totals ? (
        <>
          <div aria-hidden="true" className="relative h-3">
            <span className="absolute -left-1.5 top-0 size-3 rounded-full border border-border bg-bg" />
            <span className="absolute inset-x-3 top-1/2 border-t border-dashed border-border-strong" />
            <span className="absolute -right-1.5 top-0 size-3 rounded-full border border-border bg-bg" />
          </div>
          <div className="px-3.5 pb-2.5 pt-1">{totals}</div>
        </>
      ) : null}
      {play ? (
        <details className="group border-t border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 text-sm font-semibold text-positive-strong hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
            {m.ticketPlay}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="px-3.5 pb-3">{play}</div>
        </details>
      ) : null}
      {footer ? (
        <div className="border-t border-border px-3.5 py-2 text-xs text-muted">{footer}</div>
      ) : null}
    </article>
  );
}

/** Una partita: squadre e quota sulla prima riga, esito, orario e campionato sotto. */
export function TicketLeg({
  time,
  match,
  pick,
  price,
  probability,
  note,
  status,
}: {
  time?: ReactNode;
  match: ReactNode;
  pick: ReactNode;
  price: ReactNode;
  probability?: ReactNode;
  /** Riga in più (es. quota migliore altrove). */
  note?: ReactNode;
  /** Esito a destra (risultato e spunta) nelle schedine passate. */
  status?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-dotted border-border py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-snug">{match}</div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="rounded border border-positive/40 bg-positive-soft px-1.5 py-px text-xs font-semibold text-positive-strong">
            {pick}
          </span>
          {time ? <span className="truncate text-xs text-subtle">{time}</span> : null}
        </div>
        {note ? <div className="mt-0.5 text-xs">{note}</div> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end leading-tight">
        <span className="font-mono text-base font-semibold tabular-nums">{price}</span>
        {probability ? <span className="text-xs text-muted">{probability}</span> : null}
        {status ? <span className="mt-0.5">{status}</span> : null}
      </div>
    </li>
  );
}

/** Totali sotto lo strappo: quota in grande a destra, le altre voci a sinistra. */
export function TicketTotals({
  priceLabel,
  price,
  items,
}: {
  priceLabel: string;
  price: ReactNode;
  items: { label: string; value: ReactNode; tone?: "positive" | "muted" }[];
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <dl className="flex min-w-0 flex-col gap-0.5 text-xs">
        {items.map((i) => (
          <div key={i.label} className="flex gap-1.5 whitespace-nowrap">
            <dt className="text-muted">{i.label}</dt>
            <dd
              className={cn(
                "font-mono font-semibold tabular-nums",
                i.tone === "positive" ? "text-positive-strong" : "text-fg",
              )}
            >
              {i.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="shrink-0 text-right">
        <p className="text-xs uppercase tracking-wide text-muted">{priceLabel}</p>
        <p className="font-mono text-2xl font-bold leading-none tabular-nums text-positive-strong">
          {price}
        </p>
      </div>
    </div>
  );
}

/** "24/11/26, 18:45 · Serie A": orario e campionato della partita. */
export function whenAndWhere(
  p: { kickoffAt: string; competitionId?: number | null },
  competitions: ReadonlyMap<number, string>,
): string {
  const name = p.competitionId ? competitions.get(p.competitionId) : undefined;
  return name ? `${formatDateTime(p.kickoffAt)} · ${name}` : formatDateTime(p.kickoffAt);
}
