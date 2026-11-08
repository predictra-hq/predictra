/**
 * Ciclo del worker TypeScript dell'agente (ADR 0003, ADR 0035): lo usano gli
 * endpoint `/api/jobs/*` chiamati da QStash (fase A3). Stesso comportamento del
 * worker Python (`services/agent/src/predictra_agent/worker.py`):
 *
 * 1. apre un `agent_run` (heartbeat);
 * 2. preleva un job alla volta tra i tipi che sa eseguire, con lease, finché ci
 *    sono job pronti, entro `maxJobs` e il tempo a disposizione;
 * 3. successo → `complete_agent_job`; errore → `fail_agent_job` (retry con
 *    backoff, oppure `dead` se esauriti o non recuperabile);
 * 4. chiude il ciclo con l'esito.
 *
 * Nessun import "server-only": la logica è pura e testabile; l'accesso al
 * database è in `queue.ts`. I gestori devono essere idempotenti: un job
 * interrotto viene ripreso dopo la scadenza del lease.
 */
import type { AgentRunSource, AgentRunStatus, AgentQuotaWindow } from "@predictra/shared-types";

export const MAX_ERROR_LENGTH = 2000;

export interface ClaimedJob {
  id: number;
  type: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

/** Operazioni della coda usate dal worker (RPC di `20261108150000_agent.sql`). */
export interface AgentQueue {
  startRun(source: AgentRunSource, schedule: string, workerId: string): Promise<number>;
  finishRun(
    runId: number,
    status: Exclude<AgentRunStatus, "running">,
    counts: {
      jobsClaimed: number;
      jobsDone: number;
      jobsFailed: number;
      errorSummary: string | null;
    },
  ): Promise<void>;
  claim(
    workerId: string,
    opts: { limit: number; leaseSeconds: number; types: string[]; runId: number },
  ): Promise<ClaimedJob[]>;
  extendLease(jobId: number, workerId: string, leaseSeconds: number): Promise<void>;
  complete(jobId: number, workerId: string, result: Record<string, unknown> | null): Promise<void>;
  fail(jobId: number, workerId: string, error: string, retryable: boolean): Promise<string>;
  consumeQuota(
    provider: string,
    window: AgentQuotaWindow,
    quota: number,
    cost: number,
  ): Promise<boolean>;
}

/** Errore della coda (RPC fallita). Il messaggio non contiene mai la chiave. */
export class QueueError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "QueueError";
  }
}

/** Il worker non possiede più il job: lease scaduto e ripreso da un altro (SQLSTATE 55000). */
export class LeaseLostError extends QueueError {
  constructor(message: string) {
    super(message, "55000");
    this.name = "LeaseLostError";
  }
}

/** Errore non recuperabile (payload non valido): il job va subito in `dead`. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export interface JobContext {
  job: ClaimedJob;
  /** Prolunga il lease: da chiamare nei job lunghi, prima della scadenza. */
  extendLease(): Promise<void>;
}

export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown> | null | void>;

export interface CycleConfig {
  source: AgentRunSource;
  schedule: string;
  workerId: string;
  maxJobs?: number;
  leaseSeconds?: number;
  /** Tempo massimo del ciclo: non si preleva un nuovo job se ne resta meno di un lease. */
  timeBudgetSeconds?: number;
}

export interface CycleSummary {
  runId: number;
  status: Exclude<AgentRunStatus, "running">;
  claimed: number;
  done: number;
  failed: number;
  dead: number;
  leaseLost: number;
  errors: string[];
}

/** Toglie i segreti dal messaggio e lo tronca alla lunghezza ammessa dal database. */
export function sanitize(message: string, secrets: readonly string[] = []): string {
  let out = message;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("***");
  }
  return out.slice(0, MAX_ERROR_LENGTH);
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name;
  return String(error);
}

export async function runCycle(
  queue: AgentQueue,
  handlers: Readonly<Record<string, JobHandler>>,
  config: CycleConfig,
  opts: { secrets?: readonly string[]; now?: () => number } = {},
): Promise<CycleSummary> {
  const now = opts.now ?? Date.now;
  const secrets = opts.secrets ?? [];
  const maxJobs = config.maxJobs ?? 5;
  const leaseSeconds = config.leaseSeconds ?? 120;
  const timeBudgetMs = (config.timeBudgetSeconds ?? 240) * 1000;
  const started = now();

  const runId = await queue.startRun(config.source, config.schedule, config.workerId);
  const summary: CycleSummary = {
    runId,
    status: "succeeded",
    claimed: 0,
    done: 0,
    failed: 0,
    dead: 0,
    leaseLost: 0,
    errors: [],
  };
  const types = Object.keys(handlers).sort();
  let infrastructureError = false;

  try {
    while (summary.claimed < maxJobs) {
      if (timeBudgetMs - (now() - started) < leaseSeconds * 1000) break;
      const jobs = await queue.claim(config.workerId, { limit: 1, leaseSeconds, types, runId });
      const job = jobs[0];
      if (!job) break;
      summary.claimed += 1;
      await execute(
        queue,
        handlers[job.type]!,
        job,
        config.workerId,
        leaseSeconds,
        summary,
        secrets,
      );
    }
  } catch (error) {
    infrastructureError = true;
    summary.errors.push(sanitize(describe(error), secrets));
  }

  if (infrastructureError) summary.status = "failed";
  else if (summary.failed > 0 || summary.leaseLost > 0) summary.status = "partial";

  await queue.finishRun(runId, summary.status, {
    jobsClaimed: summary.claimed,
    jobsDone: summary.done,
    jobsFailed: summary.failed + summary.leaseLost,
    errorSummary: sanitize(summary.errors.join("; "), secrets) || null,
  });
  return summary;
}

async function execute(
  queue: AgentQueue,
  handler: JobHandler,
  job: ClaimedJob,
  workerId: string,
  leaseSeconds: number,
  summary: CycleSummary,
  secrets: readonly string[],
): Promise<void> {
  const ctx: JobContext = {
    job,
    extendLease: () => queue.extendLease(job.id, workerId, leaseSeconds),
  };
  try {
    let result: Record<string, unknown> | null | void;
    try {
      result = await handler(ctx);
    } catch (error) {
      if (error instanceof LeaseLostError) throw error;
      const message = sanitize(describe(error), secrets);
      const retryable = !(error instanceof PermanentJobError);
      const status = await queue.fail(job.id, workerId, message, retryable);
      summary.failed += 1;
      if (status === "dead") summary.dead += 1;
      summary.errors.push(`Job ${job.id} (${job.type}): ${message}`);
      return;
    }
    await queue.complete(job.id, workerId, result ?? null);
    summary.done += 1;
  } catch (error) {
    if (!(error instanceof LeaseLostError)) throw error;
    // Il lease è scaduto e un altro worker ha ripreso il job: questo tentativo non conta.
    summary.leaseLost += 1;
    summary.errors.push(`Job ${job.id} (${job.type}): lease perso`);
  }
}
