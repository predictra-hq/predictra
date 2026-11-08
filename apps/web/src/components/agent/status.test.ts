import { describe, expect, it } from "vitest";
import {
  currentWindows,
  formatMinutes,
  lastSuccess,
  overallHealth,
  sourceHealth,
  usagePercent,
} from "./status";

const row = (
  last_run_at: string | null,
  is_degraded: boolean,
  last_success_at: string | null = null,
) => ({
  last_run_at,
  is_degraded,
  last_success_at,
});

describe("stato dell'agente", () => {
  it("una sorgente mai partita è 'never', non 'degraded'", () => {
    expect(sourceHealth(row(null, true))).toBe("never");
    expect(sourceHealth(row("2026-11-08T19:00:00Z", false))).toBe("ok");
    expect(sourceHealth(row("2026-11-08T19:00:00Z", true))).toBe("degraded");
  });

  it("lo stato complessivo ignora le sorgenti non ancora pianificate", () => {
    expect(overallHealth([])).toBe("never");
    expect(overallHealth([row(null, true), row(null, true)])).toBe("never");
    // QStash attivo e regolare, GitHub Actions non ancora acceso (fase A5).
    expect(overallHealth([row("2026-11-08T19:00:00Z", false), row(null, true)])).toBe("ok");
    expect(
      overallHealth([row("2026-11-08T19:00:00Z", false), row("2026-11-08T10:00:00Z", true)]),
    ).toBe("degraded");
  });

  it("ultimo ciclo riuscito tra tutte le sorgenti", () => {
    expect(lastSuccess([])).toBeNull();
    expect(
      lastSuccess([
        row("x", false, "2026-11-08T18:45:00Z"),
        row("x", false, null),
        row("x", false, "2026-11-08T19:00:00Z"),
      ]),
    ).toBe("2026-11-08T19:00:00Z");
  });

  it("formatta la frequenza osservata", () => {
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(0)).toBeNull();
    expect(formatMinutes(0.4)).toBe("1 min");
    expect(formatMinutes(15.2)).toBe("15 min");
    expect(formatMinutes(180)).toBe("3 h");
    expect(formatMinutes(150)).toBe("2 h 30 min");
  });

  it("percentuale di budget", () => {
    expect(usagePercent({ used: 96, quota: 600 })).toBe(16);
    expect(usagePercent({ used: 700, quota: 600 })).toBe(100);
    expect(usagePercent({ used: 1, quota: 0 })).toBe(0);
  });

  it("tiene solo la finestra più recente per provider e finestra", () => {
    const rows = [
      {
        provider: "qstash",
        window_kind: "day" as const,
        window_start: "2026-11-07T00:00:00Z",
        used: 90,
      },
      {
        provider: "qstash",
        window_kind: "day" as const,
        window_start: "2026-11-08T00:00:00Z",
        used: 40,
      },
      {
        provider: "github-actions",
        window_kind: "month" as const,
        window_start: "2026-11-01T00:00:00Z",
        used: 12,
      },
    ];
    expect(currentWindows(rows).map((r) => [r.provider, r.used])).toEqual([
      ["github-actions", 12],
      ["qstash", 40],
    ]);
  });
});
