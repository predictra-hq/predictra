import type { FreshnessStatus, MatchStatus, QualityStatus } from "@predictra/shared-types";
import { Badge } from "@/components/ui/primitives";
import { freshnessTone, matchStatusTone, qualityTone } from "@/lib/football/format";
import { getMessages } from "@/lib/i18n";

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const m = getMessages();
  return <Badge tone={matchStatusTone(status)}>{m.matchCenter.matchStatus[status]}</Badge>;
}

export function QualityBadge({ quality }: { quality: QualityStatus }) {
  const m = getMessages();
  return <Badge tone={qualityTone(quality)}>{m.matchCenter.qualityStatus[quality]}</Badge>;
}

export function FreshnessBadge({ freshness }: { freshness: FreshnessStatus | null }) {
  const m = getMessages();
  if (freshness === null) return <Badge>{m.dataCenter.notAvailable}</Badge>;
  return <Badge tone={freshnessTone(freshness)}>{m.matchCenter.freshnessStatus[freshness]}</Badge>;
}

/** Attribuzione richiesta dai termini del provider (clausola 7.1 per football-data.org). */
export function ProviderAttribution({ texts }: { texts: (string | null | undefined)[] }) {
  const unique = [...new Set(texts.filter((t): t is string => Boolean(t)))];
  if (unique.length === 0) return null;
  return (
    <p className="mt-6 text-xs text-subtle">
      {unique.map((t) => (
        <span key={t} className="block">
          {t}
        </span>
      ))}
    </p>
  );
}
