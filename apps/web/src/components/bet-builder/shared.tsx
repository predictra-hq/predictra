import type { BetProposalCategory } from "@predictra/shared-types";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, Badge } from "@/components/ui/primitives";
import { confidenceLabel, formatEuro, stakeOutcome } from "@/lib/bet-builder/format";
import { getMessages } from "@/lib/i18n";
import {
  fillTemplate,
  formatDecimal,
  formatOdds,
  formatPercent,
  formatSigned,
} from "@/lib/odds/format";

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
  return (
    <Alert tone="warning" className="mb-4">
      {getMessages().betBuilder.disclaimer}
    </Alert>
  );
}

export function BetBuilderNav({ current }: { current: "proposals" | "builder" | "slips" }) {
  const m = getMessages().betBuilder;
  const items = [
    { key: "proposals", href: "/bet-builder", label: m.navProposals },
    { key: "builder", href: "/bet-builder/builder", label: m.navBuilder },
    { key: "slips", href: "/bet-builder/slips", label: m.navSlips },
  ] as const;
  return (
    <nav aria-label={m.title} className="mb-4 flex flex-wrap gap-2">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === current ? "page" : undefined}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            i.key === current
              ? "border-positive/40 bg-positive-soft text-positive-strong"
              : "border-border text-muted hover:text-fg"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <span className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <span className="text-xs text-muted" title={hint}>
        {label}
      </span>
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
}: {
  probability: number | null;
  price: number | null;
  expectedValue: number | null;
  confidence: number | null;
}) {
  const m = getMessages().betBuilder;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
