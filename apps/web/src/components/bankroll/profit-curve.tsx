import { getMessages } from "@/lib/i18n";

const W = 320;
const H = 90;

/** Profitto cumulato dopo ogni giocata chiusa (linea dello zero tratteggiata). */
export function ProfitCurve({ points, label }: { points: { profit: number }[]; label: string }) {
  const m = getMessages().tracker;
  if (points.length < 2) return null;
  const values = [0, ...points.map((p) => p.profit)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (W - 8) + 4;
  const y = (v: number) => H - 4 - ((v - min) / span) * (H - 8);
  const last = values[values.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${m.curve}: ${label}`}
      className="mt-3 h-auto w-full"
    >
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-border" strokeDasharray="4 4" />
      <polyline
        fill="none"
        strokeWidth={1.5}
        className={last >= 0 ? "stroke-positive" : "stroke-negative"}
        points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
      />
    </svg>
  );
}
