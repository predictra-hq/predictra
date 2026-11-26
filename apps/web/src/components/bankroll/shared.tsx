import type { ReactNode } from "react";
import type { BankrollKind } from "@predictra/shared-types";
import { Badge } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";

export { formatEuro } from "@/lib/format/number";
import { formatEuro } from "@/lib/format/number";

/** Reale e simulato sempre distinguibili a colpo d'occhio. */
/** Importo con segno: verde se positivo, rosso se negativo (mai solo il colore: c'è il segno). */
export function SignedEuro({ value }: { value: number | string | null | undefined }) {
  const n = value === null || value === undefined || value === "" ? null : Number(value);
  return (
    <span
      className={
        n === null || n === 0 ? undefined : n > 0 ? "text-positive-strong" : "text-negative-strong"
      }
    >
      {n !== null && n > 0 ? "+" : ""}
      {formatEuro(value)}
    </span>
  );
}

export function KindBadge({ kind }: { kind: BankrollKind }) {
  const m = getMessages().bankroll;
  return <Badge tone={kind === "REAL" ? "positive" : "warning"}>{m.kinds[kind]}</Badge>;
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-3 ${className ?? ""}`}>
      {children}
    </th>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-sm">{children}</dd>
    </div>
  );
}
