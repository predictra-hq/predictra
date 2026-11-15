import type { ModelVersionSummaryRow } from "@predictra/shared-types";
import { formatPercent } from "@/lib/predictions/format";
import { getMessages } from "@/lib/i18n";

type Bin = ModelVersionSummaryRow["calibration"][number];

const SIZE = 240;
const PAD = 28;

/**
 * Diagramma di affidabilità: probabilità prevista (x) contro frequenza osservata (y).
 * L'area dei punti è proporzionale al numero di previsioni della fascia.
 */
export function CalibrationChart({ bins, label }: { bins: readonly Bin[]; label: string }) {
  const m = getMessages().modelIntelligence;
  const inner = SIZE - 2 * PAD;
  const x = (v: number) => PAD + v * inner;
  const y = (v: number) => SIZE - PAD - v * inner;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${m.calibration}: ${label}`}
        className="h-auto w-full max-w-[280px]"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={y(0)}
              y2={y(1)}
              className="stroke-border"
              strokeWidth={0.5}
            />
            <line
              x1={x(0)}
              x2={x(1)}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border"
              strokeWidth={0.5}
            />
            <text x={x(t)} y={SIZE - 8} textAnchor="middle" className="fill-subtle text-[9px]">
              {Math.round(t * 100)}
            </text>
            <text x={10} y={y(t) + 3} textAnchor="middle" className="fill-subtle text-[9px]">
              {Math.round(t * 100)}
            </text>
          </g>
        ))}
        <line
          x1={x(0)}
          y1={y(0)}
          x2={x(1)}
          y2={y(1)}
          className="stroke-subtle"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <polyline
          fill="none"
          className="stroke-positive"
          strokeWidth={1.5}
          points={bins.map((b) => `${x(b.predicted)},${y(b.observed)}`).join(" ")}
        />
        {bins.map((b) => (
          <circle
            key={`${b.bin_low}-${b.bin_high}`}
            cx={x(b.predicted)}
            cy={y(b.observed)}
            r={2 + 4 * Math.sqrt(b.count / maxCount)}
            className="fill-positive"
          >
            <title>
              {`${m.predicted} ${formatPercent(b.predicted)} · ${m.observed} ${formatPercent(b.observed)} · n = ${b.count}`}
            </title>
          </circle>
        ))}
      </svg>
      <figcaption className="text-xs text-muted">
        {m.predicted} (x) / {m.observed} (y), %. {m.calibrationHint}
      </figcaption>
    </figure>
  );
}
