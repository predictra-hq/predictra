import type { DispatchOutcome } from "./dispatch";
import { type QStashKeys, SIGNATURE_HEADER, verifyQStashSignature } from "./qstash";
import { type AgentQueue, type JobHandler, runCycle } from "./worker";

/*
 * Logica dell'endpoint `POST /api/jobs/cycle` (fase A3), separata dalla route
 * per poterla testare senza Next né Supabase.
 *
 * 1. Senza chiavi QStash → 503: l'endpoint non è configurato e non fa nulla.
 * 2. Firma mancante o non valida → 401, senza toccare il database.
 * 3. Conta il messaggio nel budget giornaliero di QStash (ADR 0035 §2).
 * 4. Esegue un ciclo del worker TypeScript e risponde con il riepilogo.
 *    Risponde 200 anche se il ciclo è fallito: QStash non deve ritentare
 *    (retry 0, ADR 0035 §1); l'esito resta in `agent_runs`.
 * 5. Dopo il ciclo (fase A4): watchdog (`agent_watchdog`, notifiche se una sorgente è
 *    degradata) e avvio di riserva del ciclo Python se GitHub l'ha saltato. Un loro
 *    errore non fa fallire la risposta: resta visibile nel riepilogo.
 */

/** Budget giornaliero di messaggi QStash (ADR 0035 §2). */
export const QSTASH_DAILY_QUOTA = 600;
export const CYCLE_PATH = "/api/jobs/cycle";
export const CYCLE_SCHEDULE = "jobs-light";

export interface CycleEndpointDeps {
  keys: QStashKeys | null;
  /** URL pubblico dell'app (APP_BASE_URL), senza slash finale. */
  baseUrl: string;
  queue: () => AgentQueue;
  handlers: Readonly<Record<string, JobHandler>>;
  secrets: readonly string[];
  workerId: string;
  now?: () => number;
  /** Fase A4: notifica i monitor se una sorgente è degradata; restituisce le notifiche create. */
  watchdog?: () => Promise<number>;
  /** Fase A4: avvia il ciclo Python se GitHub ha saltato lo schedule. */
  fallback?: () => Promise<DispatchOutcome>;
  /** ADR 0070: salva le schedine consigliate; restituisce quante ne ha scritte. */
  slips?: () => Promise<number>;
}

async function safely<T>(fn: (() => Promise<T>) | undefined): Promise<T | "error" | null> {
  if (!fn) return null;
  try {
    return await fn();
  } catch {
    return "error";
  }
}

export async function handleCycleRequest(
  request: Request,
  deps: CycleEndpointDeps,
): Promise<Response> {
  if (!deps.keys) {
    return Response.json({ error: "QStash non configurato" }, { status: 503 });
  }
  const body = await request.text();
  const valid = await verifyQStashSignature(deps.keys, {
    signature: request.headers.get(SIGNATURE_HEADER),
    body,
    url: `${deps.baseUrl}${CYCLE_PATH}`,
  });
  if (!valid) {
    return Response.json({ error: "Firma non valida" }, { status: 401 });
  }

  const queue = deps.queue();
  const withinBudget = await queue.consumeQuota("qstash", "day", QSTASH_DAILY_QUOTA, 1);
  const summary = await runCycle(
    queue,
    deps.handlers,
    {
      source: "qstash",
      schedule: CYCLE_SCHEDULE,
      workerId: deps.workerId,
      maxJobs: 5,
      leaseSeconds: 120,
      timeBudgetSeconds: 240,
    },
    { secrets: deps.secrets, now: deps.now },
  );
  const watchdog = await safely(deps.watchdog);
  const dispatch = await safely(deps.fallback);
  const slips = await safely(deps.slips);
  return Response.json({
    run_id: summary.runId,
    status: summary.status,
    claimed: summary.claimed,
    done: summary.done,
    failed: summary.failed,
    dead: summary.dead,
    lease_lost: summary.leaseLost,
    qstash_within_budget: withinBudget,
    watchdog_notifications: watchdog,
    github_dispatch: dispatch,
    slips_recorded: slips,
  });
}
