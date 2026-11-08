import { Badge } from "@/components/ui/primitives";
import { formatPercent, marginTone } from "@/lib/odds/format";
import type { MarketAvailability } from "@/lib/odds/markets";
import { parseForm, type FormResult } from "@/lib/odds/stats";
import { getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Versione italiana (chiave `*_it`) o bookmaker di solo riferimento statistico. */
export function BookmakerKindBadge({ italian }: { italian: boolean }) {
  const m = getMessages().marketIntelligence;
  return italian ? (
    <Badge tone="positive">{m.italianBadge}</Badge>
  ) : (
    <Badge>{m.referenceBadge}</Badge>
  );
}

export function MarginBadge({ value }: { value: number }) {
  return <Badge tone={marginTone(value)}>{formatPercent(value)}</Badge>;
}

export function MarketAvailabilityBadge({ status }: { status: MarketAvailability }) {
  const m = getMessages().marketIntelligence;
  const tone =
    status === "available" ? "positive" : status === "unevaluable" ? "negative" : "warning";
  return <Badge tone={tone}>{m.availabilityStatus[status]}</Badge>;
}

const formClasses: Record<FormResult, string> = {
  V: "border-positive/40 bg-positive-soft text-positive-strong",
  N: "border-border-strong bg-surface-2 text-muted",
  P: "border-negative/40 bg-negative-soft text-negative-strong",
};

/** Ultimi risultati, dal più recente, con testo alternativo per gli screen reader. */
export function FormBadges({ form }: { form: string | null | undefined }) {
  const m = getMessages().statisticsCenter;
  const results = parseForm(form);
  if (results.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex gap-1" aria-label={results.map((r) => m.formResult[r]).join(", ")}>
      {results.map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-semibold",
            formClasses[r],
          )}
        >
          {r}
        </span>
      ))}
    </span>
  );
}
