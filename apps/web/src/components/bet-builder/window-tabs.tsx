import Link from "next/link";
import { isSlipWindow, type SlipWindow } from "@/lib/bet-builder/bollette";
import { formatRound } from "@/lib/bet-builder/format";
import { getMessages } from "@/lib/i18n";

/** Periodo scelto dall'indirizzo (`?w=day`); senza, il turno. ADR 0070. */
export function slipWindowFrom(raw: unknown): SlipWindow {
  return isSlipWindow(raw) ? raw : "round";
}

/** Titolo del periodo: «Turno venerdì 20 – lunedì 23 novembre» o «Giornata di martedì 24 novembre». */
export function windowTitle(window: SlipWindow, start: string): string {
  const m = getMessages().betBuilder;
  if (window === "round") return m.windowRound.replace("{round}", formatRound(start));
  const day = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${start}T00:00:00Z`));
  return m.windowDay.replace("{day}", day);
}

/** Scelta tra schedine del turno e della singola giornata. */
export function WindowTabs({ current, path }: { current: SlipWindow; path: string }) {
  const m = getMessages().betBuilder;
  return (
    <nav aria-label={m.windowLabel} className="tab-strip">
      {(["round", "day"] as const).map((w) => (
        <Link
          key={w}
          href={w === "round" ? path : `${path}?w=${w}`}
          aria-current={w === current ? "page" : undefined}
          scroll={false}
        >
          {m.windowTabs[w]}
        </Link>
      ))}
    </nav>
  );
}
