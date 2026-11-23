"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, X } from "lucide-react";
import { Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export interface BuilderChoice {
  key: string;
  label: string;
  /** Probabilità e quota già formattate, es. "57% · 1,74". */
  detail: string;
}

export interface BuilderMarket {
  name: string;
  choices: BuilderChoice[];
}

export interface BuilderMatch {
  matchId: number;
  title: string;
  kickoff: string;
  /** Esito finale: sempre visibile. */
  main: BuilderMarket;
  /** Doppia chance, gol, entrambe segnano: si aprono a richiesta. */
  more: BuilderMarket[];
}

export interface BuilderGroup {
  id: string;
  name: string;
  matches: BuilderMatch[];
}

export interface BuilderLabels {
  more: string;
  /** "{n} partite" */
  matches: string;
  /** "{n} giocate" */
  picked: string;
  none: string;
  evaluate: string;
  clear: string;
}

function Choices({
  market,
  matchId,
  selected,
  onToggle,
}: {
  market: BuilderMarket;
  matchId: number;
  selected: string | undefined;
  onToggle: (matchId: number, key: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{market.name}</p>
      <div
        className={cn("grid gap-1.5", market.choices.length === 2 ? "grid-cols-2" : "grid-cols-3")}
      >
        {market.choices.map((c) => {
          const on = selected === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(matchId, c.key)}
              className={cn(
                "flex min-w-0 cursor-pointer flex-col items-center rounded-lg border px-1.5 py-1.5 text-center transition-colors",
                on
                  ? "border-positive bg-positive-soft text-fg"
                  : "border-border bg-surface-2 hover:border-border-strong",
              )}
            >
              <span className="max-w-full truncate text-sm font-semibold">{c.label}</span>
              <span className="max-w-full truncate text-[11px] tabular-nums text-muted">
                {c.detail}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Scelta delle giocate di Costruisci: partite divise per campionato, una giocata per
 * partita (toccarla di nuovo la toglie). Ogni scelta aggiorna l'indirizzo e la pagina
 * ricalcola la valutazione sul server. Sul telefono una barra in basso resta sempre
 * visibile e porta alla Valutazione; sul computer la Valutazione è già a fianco.
 */
export function BuilderPicker({
  groups,
  initial,
  summary,
  labels,
}: {
  groups: BuilderGroup[];
  initial: string[];
  /** Riassunto della valutazione calcolata sul server per le giocate scelte. */
  summary: string | null;
  labels: BuilderLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Map<number, string>>(
    () => new Map(initial.map((k) => [Number(k.split(":")[0]), k])),
  );

  function update(next: Map<number, string>) {
    setPicked(next);
    const params = new URLSearchParams();
    for (const key of next.values()) params.append("s", key);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `/bet-builder/builder?${query}` : "/bet-builder/builder", {
        scroll: false,
      });
    });
  }

  function toggle(matchId: number, key: string) {
    const next = new Map(picked);
    if (next.get(matchId) === key) next.delete(matchId);
    else next.set(matchId, key);
    update(next);
  }

  const count = picked.size;
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g, gi) => (
        <details
          key={g.id}
          open={gi === 0 || g.matches.some((m) => picked.has(m.matchId))}
          className="group rounded-[var(--radius-card)] border border-border bg-surface/40 p-3"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="shrink-0 transition-transform group-open:rotate-180"
            />
            <span className="min-w-0 truncate">{g.name}</span>
            <span className="shrink-0 font-normal normal-case tracking-normal text-subtle">
              {labels.matches.replace("{n}", String(g.matches.length))}
            </span>
          </summary>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {g.matches.map((m) => {
              const sel = picked.get(m.matchId);
              const inMore = m.more.some((x) => x.choices.some((c) => c.key === sel));
              return (
                <li
                  key={m.matchId}
                  className={cn(
                    "rounded-[var(--radius-card)] border bg-surface p-3",
                    sel ? "border-positive/50" : "border-border",
                  )}
                >
                  <p className="truncate text-sm font-semibold">{m.title}</p>
                  <p className="mb-2 text-xs text-muted">{m.kickoff}</p>
                  <Choices market={m.main} matchId={m.matchId} selected={sel} onToggle={toggle} />
                  {m.more.length > 0 ? (
                    <details className="group/more mt-2" open={inMore}>
                      <summary className="flex cursor-pointer list-none items-center gap-1 py-1 text-xs font-medium text-positive-strong [&::-webkit-details-marker]:hidden">
                        <ChevronDown
                          size={14}
                          aria-hidden="true"
                          className="transition-transform group-open/more:rotate-180"
                        />
                        {labels.more}
                      </summary>
                      <div className="mt-1 flex flex-col gap-2">
                        {m.more.map((x) => (
                          <Choices
                            key={x.name}
                            market={x}
                            matchId={m.matchId}
                            selected={sel}
                            onToggle={toggle}
                          />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ))}

      {/* Barra sempre visibile sul telefono, sopra la barra di navigazione. Sul computer
          non serve: la Valutazione a destra si aggiorna da sola. */}
      <div className="sticky bottom-[calc(4.5rem+max(env(safe-area-inset-bottom),0.375rem))] z-10 lg:hidden">
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-sm font-semibold">
              {count === 0 ? labels.none : labels.picked.replace("{n}", String(count))}
            </p>
            {count > 0 && summary ? (
              <p className="truncate text-xs tabular-nums text-muted">{summary}</p>
            ) : null}
          </div>
          {count > 0 ? (
            <button
              type="button"
              onClick={() => update(new Map())}
              aria-label={labels.clear}
              className="cursor-pointer rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : null}
          <a
            href="#valutazione"
            aria-disabled={count === 0}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold",
              count === 0
                ? "pointer-events-none bg-surface-2 text-subtle"
                : "bg-positive text-on-positive hover:opacity-90",
            )}
          >
            {pending ? <Spinner /> : null}
            {labels.evaluate}
          </a>
        </div>
      </div>
    </div>
  );
}
