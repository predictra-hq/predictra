"use client";

import Link from "next/link";
import { useId, useState } from "react";

/** Testi già tradotti dal server (il componente gira nel browser). */
export interface StakeBoxLabels {
  stake: string;
  /** "Se vince incassi {payout} (+{profit})" */
  win: string;
  register: string;
  registerHint: string;
}

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

/** Euro interi, almeno 1: la puntata si sceglie senza centesimi. */
export function normalizeStake(raw: string, fallback: number): number {
  const n = Math.floor(Number(raw.replace(",", ".")));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100_000) : fallback;
}

/** Aggiunge la puntata (`st`) al link del Tracker, prima dell'ancora. */
export function withStake(href: string, stake: number): string {
  const [path, hash] = href.split("#");
  const sep = path!.includes("?") ? "&" : "?";
  return `${path}${sep}st=${stake}${hash ? `#${hash}` : ""}`;
}

/**
 * Puntata modificabile su una schedina o multipla: parte da quella consigliata, si può
 * cambiare (euro interi) e "L'ho giocata" apre le Giocate fatte con quell'importo.
 */
export function StakeBox({
  defaultStake,
  price,
  registerHref,
  labels,
}: {
  defaultStake: number;
  price: number | null;
  registerHref: string;
  labels: StakeBoxLabels;
}) {
  const id = useId();
  const [raw, setRaw] = useState(String(defaultStake));
  const stake = normalizeStake(raw, defaultStake);
  const payout = price ? stake * price : null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="text-sm text-muted">
          {labels.stake}
        </label>
        <span className="flex items-center gap-1.5">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="h-11 w-20 rounded-xl border border-input bg-bg px-2 text-center font-mono text-base font-semibold text-fg focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30"
          />
          <span className="text-sm text-muted">€</span>
        </span>
        <Link
          href={withStake(registerHref, stake)}
          title={labels.registerHint}
          className="ml-auto inline-flex h-11 items-center justify-center rounded-xl bg-positive px-4 text-sm font-semibold text-on-positive transition-colors hover:bg-positive-strong active:translate-y-px"
        >
          {labels.register}
        </Link>
      </div>
      {payout !== null ? (
        <p className="mt-2 text-sm text-positive-strong">
          {labels.win
            .replace("{payout}", euro.format(payout))
            .replace("{profit}", euro.format(payout - stake))}
        </p>
      ) : null}
    </div>
  );
}
