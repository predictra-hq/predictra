import type { ReactNode } from "react";
import type { BankrollKind } from "@predictra/shared-types";
import { Badge } from "@/components/ui/primitives";
import { getMessages } from "@/lib/i18n";

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function formatEuro(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "–";
  return euro.format(Number(value));
}

/** Reale e simulato sempre distinguibili a colpo d'occhio. */
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
