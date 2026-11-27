import type { BetProposalCategory } from "@predictra/shared-types";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/primitives";
import { formatEuro } from "@/components/bankroll/shared";
import { confidenceLabel, stakeOutcome } from "@/lib/bet-builder/format";
import { getMessages } from "@/lib/i18n";
import {
  fillTemplate,
  formatDecimal,
  formatOdds,
  formatPercent,
  formatSigned,
} from "@/lib/odds/format";
import { Tooltip } from "@/components/ui/tooltip";

const CATEGORY_TONE: Record<BetProposalCategory, "positive" | "neutral" | "warning"> = {
  CONSERVATIVE: "positive",
  BALANCED: "neutral",
  AGGRESSIVE: "warning",
};

export function CategoryBadge({ category }: { category: BetProposalCategory }) {
  return (
    <Badge tone={CATEGORY_TONE[category]}>{getMessages().betBuilder.categories[category]}</Badge>
  );
}

/** Disclaimer sempre visibile (piano M5, corsia B). */
export function BetBuilderDisclaimer() {
  return <p className="mt-8 text-xs text-subtle">{getMessages().betBuilder.disclaimer}</p>;
}

export function BetBuilderNav({
  current,
}: {
  current: "proposals" | "builder" | "slips" | "results" | "past";
}) {
  const m = getMessages().betBuilder;
  // Tre schede (ADR 0062): le schedine salvate stanno in Costruisci, le statistiche
  // delle proposte con valore in Passate.
  const active = current === "slips" ? "builder" : current === "results" ? "past" : current;
  const items = [
    { key: "proposals", href: "/bet-builder", label: m.navProposals },
    { key: "past", href: "/bet-builder/past", label: m.navPast },
    { key: "builder", href: "/bet-builder/builder", label: m.navBuilder },
  ] as const;
  return (
    <nav aria-label={m.title} className="tab-strip">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === active ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <span className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <Tooltip label={hint} align="start">
        <span className="text-xs text-muted">{label}</span>
      </Tooltip>
      <span className="font-mono text-base">{value}</span>
    </span>
  );
}

/**
 * Simulazione di una puntata su una combinazione: quanto si incassa se vince e con
 * quale probabilità, quanto si perde altrimenti. Non registra né piazza nulla.
 */
export function StakeSimulation({
  stake,
  price,
  probability,
}: {
  stake: number;
  price: number;
  probability: number;
}) {
  const m = getMessages().betBuilder;
  const o = stakeOutcome(stake, price, probability);
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
      <p className="mb-1 text-xs text-muted">
        {fillTemplate(m.stakeTitle, { stake: formatEuro(stake) })}
      </p>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-positive-strong">
          {fillTemplate(m.stakeWin, {
            payout: formatEuro(o.payout),
            profit: `+${formatEuro(o.profit)}`,
          })}
        </span>
        <span className="font-mono text-xs text-muted">
          {fillTemplate(m.stakeWinProbability, { p: formatPercent(probability) })}
        </span>
      </p>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-negative-strong">
          {fillTemplate(m.stakeLose, { stake: formatEuro(stake) })}
        </span>
        <span className="font-mono text-xs text-muted">
          {fillTemplate(m.stakeWinProbability, { p: formatPercent(o.loseProbability) })}
        </span>
      </p>
      <p className="mt-1 text-xs text-subtle">{m.stakeNote}</p>
    </div>
  );
}

/** Probabilità, quota, EV e Confidence Score di una combinazione. */
export function Metrics({
  probability,
  price,
  expectedValue,
  confidence,
  compact = false,
}: {
  probability: number | null;
  price: number | null;
  expectedValue: number | null;
  confidence: number | null;
  /** In una colonna stretta (Valutazione di Costruisci): sempre due per riga. */
  compact?: boolean;
}) {
  const m = getMessages().betBuilder;
  return (
    <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2 sm:grid-cols-4"}>
      <Metric label={m.probability} value={formatPercent(probability)} />
      <Metric label={m.combinedPrice} value={formatOdds(price)} />
      <Metric
        label={m.expectedValue}
        hint={m.expectedValueHint}
        value={expectedValue === null ? "—" : formatSigned(expectedValue * 100, 1) + "%"}
      />
      <Metric
        label={m.confidence}
        value={
          confidence === null
            ? "—"
            : `${formatDecimal(confidence)} · ${confidenceLabel(confidence)}`
        }
      />
    </div>
  );
}
