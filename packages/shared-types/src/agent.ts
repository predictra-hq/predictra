/**
 * Contratto M7 — agente autonomo: coda dei job, cicli, contatori di budget, notifiche.
 *
 * Specchia `supabase/migrations/20261108150000_agent.sql` (verificato da
 * `supabase/tests/agent.test.ts`). Dizionario: docs/data-dictionary/agent.md.
 * Decisioni: ADR 0003 (coda su Postgres), ADR 0035 (pianificazione e budget).
 */

/** Stati di un job (ADR 0003). `failed` = in attesa di un nuovo tentativo; `dead` = dead-letter. */
export const AGENT_JOB_STATUSES = ["queued", "running", "done", "failed", "dead"] as const;
export type AgentJobStatus = (typeof AGENT_JOB_STATUSES)[number];

/** Chi ha avviato un ciclo dell'agente (ADR 0035). */
export const AGENT_RUN_SOURCES = ["qstash", "github_actions", "manual"] as const;
export type AgentRunSource = (typeof AGENT_RUN_SOURCES)[number];

export const AGENT_RUN_STATUSES = ["running", "succeeded", "partial", "failed"] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const AGENT_QUOTA_WINDOWS = ["minute", "hour", "day", "month"] as const;
export type AgentQuotaWindow = (typeof AGENT_QUOTA_WINDOWS)[number];

export const NOTIFICATION_SEVERITIES = ["info", "warning", "error"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/** Valori predefiniti delle funzioni della coda. */
export const AGENT_DEFAULTS = {
  maxAttempts: 5,
  leaseSeconds: 300,
  maxClaim: 50,
  backoffBaseSeconds: 30,
  backoffCapSeconds: 21_600,
} as const;

/**
 * Intervallo dell'attesa prima del tentativo successivo (in secondi), come
 * `app_private.agent_backoff`: base = 30 s · 2^(tentativo − 1), al massimo
 * 6 ore; attesa casuale in [base/2, base] ("equal jitter").
 */
export function agentBackoffBoundsSeconds(attempt: number): [number, number] {
  const base = Math.min(
    AGENT_DEFAULTS.backoffBaseSeconds * 2 ** (Math.max(attempt, 1) - 1),
    AGENT_DEFAULTS.backoffCapSeconds,
  );
  return [base / 2, base];
}

/** Riga di `agent_jobs`. */
export interface AgentJob {
  id: number;
  type: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  status: AgentJobStatus;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  locked_by: string | null;
  locked_until: string | null;
  last_error: string | null;
  result: Record<string, unknown> | null;
  last_run_id: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** Riga di `agent_runs` (heartbeat di un ciclo). */
export interface AgentRun {
  id: number;
  source: AgentRunSource;
  schedule: string;
  worker_id: string;
  status: AgentRunStatus;
  started_at: string;
  finished_at: string | null;
  jobs_claimed: number;
  jobs_done: number;
  jobs_failed: number;
  error_summary: string | null;
}

/** Riga di `agent_rate_limits`. */
export interface AgentRateLimit {
  provider: string;
  window_kind: AgentQuotaWindow;
  window_start: string;
  used: number;
  quota: number;
  updated_at: string;
}

/** Riga di `notifications` (solo quelle del proprietario sono visibili). */
export interface Notification {
  id: number;
  user_id: string;
  kind: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  link: string | null;
  dedupe_key: string | null;
  source_job_id: number | null;
  created_at: string;
  read_at: string | null;
}

/** Riga di `v_agent_status` (una per sorgente pianificata). */
export interface AgentStatusRow {
  source: Exclude<AgentRunSource, "manual">;
  expected_interval_minutes: number;
  degraded_after_minutes: number;
  last_run_at: string | null;
  last_run_status: AgentRunStatus | null;
  last_success_at: string | null;
  runs_24h: number;
  failed_runs_24h: number;
  /** Media degli intervalli tra gli avvii nelle ultime 24 ore; null con meno di 2 cicli. */
  observed_interval_minutes: number | null;
  is_degraded: boolean;
}

/** Riga di `v_agent_queue_summary`. */
export interface AgentQueueSummaryRow {
  type: string;
  status: AgentJobStatus;
  jobs: number;
  ready: number;
  lease_expired: number;
  next_run_at: string | null;
  last_change_at: string;
}

/** Risultato di `enqueue_agent_job`. */
export interface EnqueueAgentJobResult {
  job_id: number;
  created: boolean;
  status: AgentJobStatus;
}
