import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnqueueAgentJobResult } from "@predictra/shared-types";
import { type AgentQueue, type ClaimedJob, LeaseLostError, QueueError } from "./worker";

/*
 * Coda dell'agente via RPC (docs/data-dictionary/agent.md). Va usata con il
 * client a chiave segreta (`createAdminClient`) e SOLO dopo aver verificato la
 * firma QStash della richiesta (fase A3): le funzioni sono eseguibili solo da
 * service_role.
 */

interface RpcError {
  code?: string;
  message?: string;
}

function toError(name: string, error: RpcError): QueueError {
  const message = `Supabase ${name}: ${error.message ?? "errore"}`;
  return error.code === "55000" ? new LeaseLostError(message) : new QueueError(message, error.code);
}

export function supabaseQueue(client: SupabaseClient): AgentQueue & {
  enqueue(
    type: string,
    idempotencyKey: string,
    payload?: Record<string, unknown>,
    opts?: { runAt?: string; maxAttempts?: number },
  ): Promise<EnqueueAgentJobResult>;
  recoverExpired(): Promise<number>;
} {
  async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, params);
    if (error) throw toError(name, error);
    return data as T;
  }

  return {
    async enqueue(type, idempotencyKey, payload = {}, opts = {}) {
      const rows = await rpc<EnqueueAgentJobResult[]>("enqueue_agent_job", {
        p_type: type,
        p_idempotency_key: idempotencyKey,
        p_payload: payload,
        p_run_at: opts.runAt ?? null,
        p_max_attempts: opts.maxAttempts ?? 5,
      });
      const row = rows[0];
      if (!row) throw new QueueError("Supabase enqueue_agent_job: nessuna riga");
      return row;
    },
    recoverExpired: () => rpc<number>("recover_expired_agent_jobs", {}),
    startRun: (source, schedule, workerId) =>
      rpc<number>("start_agent_run", {
        p_source: source,
        p_schedule: schedule,
        p_worker_id: workerId,
      }),
    async finishRun(runId, status, counts) {
      await rpc("finish_agent_run", {
        p_run_id: runId,
        p_status: status,
        p_jobs_claimed: counts.jobsClaimed,
        p_jobs_done: counts.jobsDone,
        p_jobs_failed: counts.jobsFailed,
        p_error_summary: counts.errorSummary,
      });
    },
    async claim(workerId, opts) {
      const rows = await rpc<ClaimedJob[] | null>("claim_agent_jobs", {
        p_worker_id: workerId,
        p_limit: opts.limit,
        p_lease_seconds: opts.leaseSeconds,
        p_types: opts.types,
        p_run_id: opts.runId,
      });
      return (rows ?? []).map((r) => ({
        id: Number(r.id),
        type: r.type,
        idempotency_key: r.idempotency_key,
        payload: r.payload ?? {},
        attempts: r.attempts,
        max_attempts: r.max_attempts,
      }));
    },
    async extendLease(jobId, workerId, leaseSeconds) {
      await rpc("extend_agent_job_lease", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_lease_seconds: leaseSeconds,
      });
    },
    async complete(jobId, workerId, result) {
      await rpc("complete_agent_job", { p_job_id: jobId, p_worker_id: workerId, p_result: result });
    },
    fail: (jobId, workerId, error, retryable) =>
      rpc<string>("fail_agent_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_error: error,
        p_retryable: retryable,
      }),
    consumeQuota: (provider, window, quota, cost) =>
      rpc<boolean>("consume_agent_quota", {
        p_provider: provider,
        p_window: window,
        p_quota: quota,
        p_cost: cost,
      }),
  };
}
