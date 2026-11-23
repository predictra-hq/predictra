import Link from "next/link";
import { getMessages } from "@/lib/i18n";

/** Campionati e Squadre sono una sezione sola (ADR 0065): due schede in alto. */
export function LeaguesNav({ current }: { current: "leagues" | "teams" }) {
  const m = getMessages().leagueIntelligence;
  const items = [
    { key: "leagues", href: "/leagues", label: m.tabLeagues },
    { key: "teams", href: "/teams", label: m.tabTeams },
  ] as const;
  return (
    <nav aria-label={m.title} className="tab-strip">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === current ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
