import "server-only";
import type {
  AgentJob,
  AgentJobStatus,
  AgentQueueSummaryRow,
  AgentRateLimit,
  AgentRun,
  AgentStatusRow,
  Notification,
} from "@predictra/shared-types";
import { createClient } from "@/lib/supabase/server";

/*
 * Letture lato server sul contratto M7 (docs/data-dictionary/agent.md), con la
 * sessione dell'utente: la RLS mostra code, cicli e contatori solo a chi ha
 * `agents.monitor`, e le notifiche solo al proprietario. Le pagine chiamano
 * prima `requireUser()` o `requirePermission("agents.monitor")`.
 */

export class AgentDataUnavailable extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Lettura non riuscita: ${what}`, { cause });
  }
}

export async function getAgentStatus(): Promise<AgentStatusRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_agent_status").select("*").order("source");
  if (error) throw new AgentDataUnavailable("stato dell'agente", error);
  return (data ?? []).map((r) => ({
    ...r,
    observed_interval_minutes:
      r.observed_interval_minutes === null ? null : Number(r.observed_interval_minutes),
  })) as AgentStatusRow[];
}

export async function getQueueSummary(): Promise<AgentQueueSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_agent_queue_summary")
    .select("*")
    .order("type")
    .order("status");
  if (error) throw new AgentDataUnavailable("riepilogo delle code", error);
  return (data ?? []) as AgentQueueSummaryRow[];
}

export const JOB_LIST_LIMIT = 50;

export type AgentJobListRow = Pick<
  AgentJob,
  | "id"
  | "type"
  | "idempotency_key"
  | "status"
  | "attempts"
  | "max_attempts"
  | "next_run_at"
  | "locked_by"
  | "locked_until"
  | "last_error"
  | "updated_at"
>;

/** Job più recenti, filtrabili per stato. */
export async function listJobs(status: AgentJobStatus | null): Promise<AgentJobListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("agent_jobs")
    .select(
      "id, type, idempotency_key, status, attempts, max_attempts, next_run_at, locked_by, locked_until, last_error, updated_at",
    )
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(JOB_LIST_LIMIT);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new AgentDataUnavailable("job", error);
  return (data ?? []) as AgentJobListRow[];
}

export const RUN_LIST_LIMIT = 30;

export async function listRuns(): Promise<AgentRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(RUN_LIST_LIMIT);
  if (error) throw new AgentDataUnavailable("cicli", error);
  return (data ?? []) as AgentRun[];
}

/** Contatori delle finestre ancora aperte o appena chiuse (ultimi 31 giorni). */
export async function listRateLimits(): Promise<AgentRateLimit[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("agent_rate_limits")
    .select("*")
    .gte("window_start", since)
    .order("window_start", { ascending: false })
    .limit(30);
  if (error) throw new AgentDataUnavailable("budget", error);
  return (data ?? []) as AgentRateLimit[];
}

export const NOTIFICATION_LIMIT = 10;

/** Notifiche dell'utente corrente (la RLS mostra solo le proprie), prima le non lette. */
export async function listMyNotifications(): Promise<{ items: Notification[]; unread: number }> {
  const supabase = await createClient();
  const [list, unread] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .order("read_at", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_LIMIT),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (list.error) throw new AgentDataUnavailable("notifiche", list.error);
  if (unread.error) throw new AgentDataUnavailable("notifiche", unread.error);
  return { items: (list.data ?? []) as Notification[], unread: unread.count ?? 0 };
}
