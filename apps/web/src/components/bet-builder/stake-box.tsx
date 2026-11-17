"use client";

import Link from "next/link";
import { useId, useState } from "react";

/** Testi già tradotti dal server (il componente gira nel browser). */
export interface StakeBoxLabels {
  stake: string;
  odds: string;
  /** "Quota di {site}: se il tuo sito ne offre un'altra, cambiala." */
  oddsHint: string;
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

/** Quota decimale sopra 1 (virgola accettata, due decimali); altrimenti il valore di riserva. */
export function normalizeOdds(raw: string, fallback: number | null): number | null {
  const n = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 1 || n > 10_000) return fallback;
  return Math.round(n * 100) / 100;
}

/**
 * Link del Tracker con ciò che l'utente ha scelto: puntata (`st`), quota (`o`) e sito
 * (`bk`), prima dell'ancora. I valori già presenti nel link vengono sostituiti.
 */
export function withPlay(
  href: string,
  play: { stake: number; odds?: number | null; site?: string | null },
): string {
  const [path, hash] = href.split("#");
  const [base, query] = path!.split("?");
  const params = new URLSearchParams(query ?? "");
  if (play.odds) params.set("o", play.odds.toFixed(2));
  if (play.site) params.set("bk", play.site.slice(0, 40));
  params.set("st", String(play.stake));
  return `${base}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

/** Aggiunge la sola puntata al link del Tracker. */
export function withStake(href: string, stake: number): string {
  return withPlay(href, { stake });
}

const FIELD =
  "h-11 w-full rounded-xl border border-input bg-bg px-2 text-center font-mono text-base font-semibold text-fg focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30";

/**
 * Puntata e quota modificabili su una schedina o multipla. Partono da quelle proposte
 * (puntata consigliata, quota del sito dell'utente o migliore disponibile), si possono
 * cambiare e "L'ho giocata" apre le Giocate fatte con quei valori.
 */
export function StakeBox({
  defaultStake,
  price,
  site = null,
  registerHref,
  labels,
}: {
  defaultStake: number;
  price: number | null;
  /** Sito del bankroll dell'utente: finisce nella giocata registrata. */
  site?: string | null;
  registerHref: string;
  labels: StakeBoxLabels;
}) {
  const id = useId();
  const [rawStake, setRawStake] = useState(String(defaultStake));
  const [rawOdds, setRawOdds] = useState(price ? price.toFixed(2).replace(".", ",") : "");
  const stake = normalizeStake(rawStake, defaultStake);
  const odds = normalizeOdds(rawOdds, price);
  const payout = odds ? stake * odds : null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${id}-stake`} className="flex flex-col gap-1 text-xs text-muted">
          {labels.stake} (€)
          <input
            id={`${id}-stake`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={rawStake}
            onChange={(e) => setRawStake(e.target.value)}
            className={FIELD}
          />
        </label>
        <label htmlFor={`${id}-odds`} className="flex flex-col gap-1 text-xs text-muted">
          {labels.odds}
          <input
            id={`${id}-odds`}
            type="text"
            inputMode="decimal"
            value={rawOdds}
            onChange={(e) => setRawOdds(e.target.value)}
            className={FIELD}
          />
        </label>
      </div>
      {site ? (
        <p className="mt-1.5 text-xs text-subtle">{labels.oddsHint.replace("{site}", site)}</p>
      ) : null}
      {payout !== null ? (
        <p className="mt-2 text-sm text-positive-strong">
          {labels.win
            .replace("{payout}", euro.format(payout))
            .replace("{profit}", euro.format(payout - stake))}
        </p>
      ) : null}
      <Link
        href={withPlay(registerHref, { stake, odds, site })}
        title={labels.registerHint}
        className="mt-3 flex h-11 items-center justify-center rounded-xl bg-positive px-4 text-sm font-semibold text-on-positive transition-colors hover:bg-positive-strong active:translate-y-px"
      >
        {labels.register}
      </Link>
    </div>
  );
}
