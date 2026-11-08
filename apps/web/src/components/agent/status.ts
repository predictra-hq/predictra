import type { AgentRateLimit, AgentStatusRow } from "@predictra/shared-types";

/*
 * Logica di presentazione dello stato dell'agente (M7 corsia B), pura e testata.
 * Le soglie vengono da `v_agent_status` (ADR 0035): qui non si inventano numeri.
 */

export type AgentHealth = "ok" | "degraded" | "never";

/** Stato di una sorgente: `never` se non ha mai girato, altrimenti dalla vista. */
export function sourceHealth(
  row: Pick<AgentStatusRow, "last_run_at" | "is_degraded">,
): AgentHealth {
  if (!row.last_run_at) return "never";
  return row.is_degraded ? "degraded" : "ok";
}

/**
 * Stato complessivo: conta solo le sorgenti che hanno già girato almeno una volta
 * (una sorgente non ancora pianificata, per esempio GitHub Actions prima della
 * fase A5, non rende l'agente "degradato"). Basta una sorgente attiva degradata.
 */
export function overallHealth(
  rows: readonly Pick<AgentStatusRow, "last_run_at" | "is_degraded">[],
): AgentHealth {
  const active = rows.filter((r) => r.last_run_at);
  if (active.length === 0) return "never";
  return active.some((r) => r.is_degraded) ? "degraded" : "ok";
}

/** Ultimo ciclo riuscito tra tutte le sorgenti. */
export function lastSuccess(
  rows: readonly Pick<AgentStatusRow, "last_success_at">[],
): string | null {
  return rows.reduce<string | null>(
    (best, r) =>
      r.last_success_at && (!best || r.last_success_at > best) ? r.last_success_at : best,
    null,
  );
}

/** "15 min", "3 h", "2 h 30 min"; `null` se non c'è una frequenza osservata. */
export function formatMinutes(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const total = Math.round(minutes);
  if (total < 60) return `${Math.max(total, 1)} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Percentuale di budget usata, arrotondata, tra 0 e 100. */
export function usagePercent(row: Pick<AgentRateLimit, "used" | "quota">): number {
  if (row.quota <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((row.used / row.quota) * 100)));
}

/** Per ogni (provider, finestra) tiene solo la finestra più recente. */
export function currentWindows<
  T extends Pick<AgentRateLimit, "provider" | "window_kind" | "window_start">,
>(rows: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.provider}|${r.window_kind}`;
    const prev = latest.get(key);
    if (!prev || r.window_start > prev.window_start) latest.set(key, r);
  }
  return [...latest.values()].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.window_kind.localeCompare(b.window_kind),
  );
}

export function healthTone(health: AgentHealth): "positive" | "warning" | "neutral" {
  return health === "ok" ? "positive" : health === "degraded" ? "warning" : "neutral";
}
