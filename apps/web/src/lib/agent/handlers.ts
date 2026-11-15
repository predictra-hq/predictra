import { type JobHandler, PermanentJobError } from "./worker";

/**
 * Gestori dei job eseguiti dal worker TypeScript (endpoint `/api/jobs/*`, fase A3).
 * I job leggeri dell'ADR 0035 (`agent.tick`, `agent.plan`, `agent.watchdog`)
 * arrivano con A3–A4; i job Python li esegue `services/agent`.
 *
 * `agent.selftest.web` verifica il ciclo su DEV senza leggere né scrivere dati.
 * Payload facoltativo `{"fail_attempts": n}` (fallisce i primi n tentativi) o
 * `{"permanent": true}` (errore non recuperabile).
 */
export const selftest: JobHandler = async ({ job }) => {
  if (job.payload.permanent === true) {
    throw new PermanentJobError(
      "agent.selftest.web: errore non recuperabile richiesto dal payload",
    );
  }
  const failAttempts = job.payload.fail_attempts ?? 0;
  if (typeof failAttempts !== "number" || !Number.isInteger(failAttempts) || failAttempts < 0) {
    throw new PermanentJobError("agent.selftest.web: fail_attempts deve essere un intero >= 0");
  }
  if (job.attempts <= failAttempts) {
    throw new Error(`agent.selftest.web: fallimento richiesto (tentativo ${job.attempts})`);
  }
  return { ok: true, attempt: job.attempts };
};

export const WEB_HANDLERS: Readonly<Record<string, JobHandler>> = {
  "agent.selftest.web": selftest,
};
