/** Intervalli di tempo del Tracker, calcolati rispetto a `now`. */
export const PERIODS = ["30", "90", "all"] as const;
export type Period = (typeof PERIODS)[number];

export function parsePeriod(value: unknown): Period {
  return PERIODS.includes(value as Period) ? (value as Period) : "90";
}

export function timeWindows(period: Period, now: Date = new Date()) {
  const day = 86_400_000;
  return {
    since: period === "all" ? null : new Date(now.getTime() - Number(period) * day),
    dayAgo: new Date(now.getTime() - day),
    weekAgo: new Date(now.getTime() - 7 * day),
  };
}
