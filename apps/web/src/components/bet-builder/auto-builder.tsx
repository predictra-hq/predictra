import Link from "next/link";
import { ArrowRight, BotMessageSquare, Sparkles } from "lucide-react";
import { BET_PROPOSAL_CATEGORIES, type BetProposalCategory } from "@predictra/shared-types";
import { Alert, Card, CardTitle } from "@/components/ui/primitives";
import { AUTO_LEG_CHOICES, type SlipAnalysis } from "@/lib/bet-builder/auto";
import { selectionLabel } from "@/lib/bet-builder/format";
import { getMessages } from "@/lib/i18n";
import { fillTemplate, formatOdds, formatPercent } from "@/lib/odds/format";
import { cn } from "@/lib/utils";

const chip =
  "cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm has-[:checked]:border-positive has-[:checked]:bg-positive-soft has-[:checked]:font-medium has-[:checked]:text-positive-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-positive";

/**
 * «Costruiscila per me» (ADR 0081): si sceglie quanto rischiare ed eventualmente quante
 * partite, e la pagina riempie la schedina con le giocate più probabili del modello. Un
 * modulo GET: l'indirizzo ricorda la scelta e funziona anche senza JavaScript.
 */
export function AutoBuilderForm({
  level,
  legs,
}: {
  level: BetProposalCategory | null;
  legs: number | null;
}) {
  const b = getMessages().betBuilder;
  return (
    <Card className="mb-4">
      <CardTitle className="flex items-center gap-2">
        <Sparkles size={18} aria-hidden="true" className="text-positive" />
        {b.autoTitle}
      </CardTitle>
      <p className="mb-3 mt-1 text-sm text-muted">{b.autoHint}</p>
      <form action="/bet-builder/builder" method="get" className="flex flex-col gap-3">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{b.autoLevel}</legend>
          <div className="flex flex-wrap gap-2">
            {BET_PROPOSAL_CATEGORIES.map((c) => (
              <label key={c} className={chip} title={b.categoryHints[c]}>
                <input
                  type="radio"
                  name="auto"
                  value={c}
                  defaultChecked={(level ?? "CONSERVATIVE") === c}
                  className="sr-only"
                />
                {b.categories[c]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{b.autoLegs}</legend>
          <div className="flex flex-wrap gap-2">
            {[null, ...AUTO_LEG_CHOICES].map((n) => (
              <label key={n ?? "auto"} className={chip}>
                <input
                  type="radio"
                  name="legs"
                  value={n ?? ""}
                  defaultChecked={legs === n}
                  className="sr-only"
                />
                {n === null ? b.autoLegsAuto : n}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <button
            type="submit"
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-positive px-4 text-sm font-medium text-on-positive transition-[filter] hover:brightness-95 active:brightness-90"
          >
            <Sparkles size={16} aria-hidden="true" />
            {b.autoButton}
          </button>
        </div>
      </form>
    </Card>
  );
}

const VERDICT_TONE: Record<BetProposalCategory, "positive" | "warning" | "negative"> = {
  CONSERVATIVE: "positive",
  BALANCED: "warning",
  AGGRESSIVE: "negative",
};

/**
 * Analisi della schedina scelta (ADR 0081): quanto è sicura in parole semplici, la giocata
 * più debole e cosa cambierebbe togliendone o sostituendone una, con un tocco per
 * applicare la modifica. «Chiedi a PREDICTRA» apre la chat con la domanda già scritta:
 * i numeri sono del modello, la chat li spiega soltanto.
 */
export function SlipAnalysisCard({
  analysis,
  picks,
  hrefFor,
}: {
  analysis: SlipAnalysis;
  /** Giocate della schedina in parole, es. «Inter – Milan: 1 (55%)», per la domanda a Chiedi. */
  picks: string[];
  /** Indirizzo di Costruisci con queste chiavi. */
  hrefFor: (keys: string[]) => string;
}) {
  const b = getMessages().betBuilder;
  const pick = (s: SlipAnalysis["weakest"]) =>
    selectionLabel(s.selection, s.homeTeam, s.awayTeam, s.market, s.line);
  const weakest = pick(analysis.weakest);
  const odds = (price: number | null) => (price === null ? "–" : formatOdds(price));

  // Domanda già scritta per Chiedi (al massimo 500 caratteri, come il campo della chat).
  const question = fillTemplate(b.askQuestion, {
    picks: picks.join("; "),
    p: formatPercent(analysis.probability, 0),
    weakest,
  }).slice(0, 500);

  return (
    <Card>
      <CardTitle className="mb-3">{b.analysisTitle}</CardTitle>
      <Alert tone={VERDICT_TONE[analysis.category]}>
        <span className="font-semibold">{b.verdicts[analysis.category]}.</span>{" "}
        {fillTemplate(b.analysisOutOf, { n: analysis.outOf100 })}
      </Alert>
      <p className="mt-3 text-sm">
        {fillTemplate(b.analysisWeakest, {
          pick: weakest,
          match: `${analysis.weakest.homeTeam} – ${analysis.weakest.awayTeam}`,
          p: formatPercent(analysis.weakest.probability ?? 0, 0),
        })}
      </p>

      {analysis.whatIfs.length > 0 ? (
        <>
          <h3 className="mb-1.5 mt-4 text-sm font-semibold">{b.whatIfTitle}</h3>
          <ul className="flex flex-col divide-y divide-border">
            {analysis.whatIfs.map((w) => (
              <li
                key={`${w.kind}-${w.keys.join(",")}`}
                className="flex items-center gap-2 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {w.kind === "remove"
                      ? fillTemplate(b.whatIfRemove, { pick: pick(w.from) })
                      : fillTemplate(b.whatIfSwap, { to: pick(w.to!), pick: pick(w.from) })}
                  </p>
                  <p className="text-xs tabular-nums text-muted">
                    {fillTemplate(b.whatIfResult, {
                      from: formatPercent(analysis.probability, 0),
                      to: formatPercent(w.probability, 0),
                      price: odds(w.price),
                    })}
                  </p>
                </div>
                <Link
                  href={hrefFor(w.keys)}
                  scroll={false}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                >
                  {b.whatIfApply}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <Link
        href={`/ask?q=${encodeURIComponent(question)}`}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-lg bg-positive-soft px-3 py-2 text-sm font-medium text-positive-strong",
          "transition-[filter] hover:brightness-95 active:brightness-90",
        )}
      >
        <BotMessageSquare size={16} aria-hidden="true" />
        {b.askRisk}
      </Link>
      <p className="mt-3 text-xs text-subtle">{b.analysisNote}</p>
    </Card>
  );
}
