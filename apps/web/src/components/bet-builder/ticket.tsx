import type { ReactNode } from "react";
import { Logo } from "@/components/shell/logo";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/*
 * Schedina disegnata come un biglietto (ADR 0065): intestazione con il simbolo di
 * PREDICTRA, una riga per partita con orario, esito e quota, uno strappo tratteggiato con
 * le due tacche ai lati, poi i totali in grande. La usano le schedine consigliate, le
 * passate e le proposte con valore, così si riconoscono a colpo d'occhio.
 */

export function Ticket({
  title,
  subtitle,
  badge,
  children,
  totals,
  footer,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  /** Righe delle partite (`TicketLeg`). */
  children: ReactNode;
  /** Riquadro dei totali sotto lo strappo (`TicketTotals`). */
  totals?: ReactNode;
  /** Puntata, condivisione, note. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.25)]",
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-dashed border-border bg-positive-soft/60 px-4 py-2.5">
        <Logo className="size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-positive-strong">
            {getMessages().betBuilder.ticketLabel}
          </p>
          <h4 className="truncate text-base font-semibold leading-tight">{title}</h4>
        </div>
        {badge}
      </header>
      {subtitle ? <p className="px-4 pt-2 text-xs text-muted">{subtitle}</p> : null}
      <ol className="flex-1 px-4">{children}</ol>
      {totals ? (
        <>
          <div aria-hidden="true" className="relative my-1 h-4">
            <span className="absolute -left-2 top-0 size-4 rounded-full border border-border bg-bg" />
            <span className="absolute inset-x-4 top-1/2 border-t-2 border-dashed border-border" />
            <span className="absolute -right-2 top-0 size-4 rounded-full border border-border bg-bg" />
          </div>
          <div className="px-4 pb-3">{totals}</div>
        </>
      ) : null}
      {footer ? <div className="border-t border-border px-4 py-3">{footer}</div> : null}
    </article>
  );
}

/** Una partita della schedina: orario, partita, esito scelto e quota. */
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
    <li className="flex items-start gap-3 border-b border-dotted border-border py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        {time ? (
          <p className="font-mono text-[11px] uppercase tracking-wide text-subtle">{time}</p>
        ) : null}
        <div className="truncate text-sm font-medium">{match}</div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md border border-positive/40 bg-positive-soft px-1.5 py-0.5 text-xs font-semibold text-positive-strong">
            {pick}
          </span>
          {probability ? <span className="text-xs text-muted">{probability}</span> : null}
        </p>
        {note ? <div className="mt-1 text-xs">{note}</div> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-base font-semibold tabular-nums">{price}</span>
        {status}
      </div>
    </li>
  );
}

/** Totali sotto lo strappo: quota in grande, poi le altre voci in piccolo. */
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
      <dl className="flex flex-col gap-0.5 text-xs">
        {items.map((i) => (
          <div key={i.label} className="flex gap-1.5">
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
      <div className="text-right">
        <p className="text-[11px] uppercase tracking-wide text-muted">{priceLabel}</p>
        <p className="font-mono text-3xl font-bold leading-none tabular-nums text-positive-strong">
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
