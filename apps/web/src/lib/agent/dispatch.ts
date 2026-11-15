/*
 * Avvio di riserva del ciclo Python (M7 fase A4, ADR 0035, punto aperto 1).
 *
 * GitHub può ritardare o saltare gli schedule nei momenti di carico: il 9/11/2026
 * nessun workflow programmato è partito per circa 9 ore. QStash invece chiama
 * l'endpoint ogni 15 minuti. Se il ciclo `github_actions` non parte da più di
 * MISSED_AFTER_MINUTES, l'endpoint chiede a GitHub di avviare il workflow
 * _Agent (Python)_ (`workflow_dispatch`, branch `dev`, con le stesse pianificazioni
 * dello schedule). Al massimo un avvio l'ora (contatore `github-dispatch`).
 *
 * Spento finché non esiste GITHUB_DISPATCH_TOKEN (token GitHub a grana fine, solo
 * questo repository, permesso Actions: Read and write). Gratuito: i minuti restano
 * nel budget dell'agente (900 al mese), contati dal ciclo stesso.
 */

export interface DispatchConfig {
  token: string;
  repo: string;
  workflow: string;
  ref: string;
}

/** Oltre lo schedule ogni 3 h, più il ritardo tipico di GitHub (fino a ~30 min). */
export const MISSED_AFTER_MINUTES = 210;
export const DISPATCH_QUOTA_PER_HOUR = 1;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function dispatchConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): DispatchConfig | null {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) return null;
  const repo = env.GITHUB_DISPATCH_REPO?.trim() || "predictra-hq/predictra";
  if (!REPO_RE.test(repo)) return null;
  return { token, repo, workflow: "agent-python.yml", ref: "dev" };
}

/** `true` se l'ultimo ciclo GitHub Actions è più vecchio della soglia (o non c'è mai stato). */
export function cycleMissed(lastRunAt: string | null, now: number): boolean {
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  if (Number.isNaN(last)) return true;
  return now - last > MISSED_AFTER_MINUTES * 60_000;
}

export type DispatchOutcome = "disabled" | "not-needed" | "rate-limited" | "dispatched" | "failed";

export interface FallbackDeps {
  config: DispatchConfig | null;
  /** `last_run_at` della riga `github_actions` di v_agent_status. */
  lastGithubRun: () => Promise<string | null>;
  consumeQuota: (provider: string, quota: number) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export async function dispatchIfMissed(deps: FallbackDeps): Promise<DispatchOutcome> {
  const { config } = deps;
  if (!config) return "disabled";
  const now = (deps.now ?? Date.now)();
  if (!cycleMissed(await deps.lastGithubRun(), now)) return "not-needed";
  if (!(await deps.consumeQuota("github-dispatch", DISPATCH_QUOTA_PER_HOUR))) return "rate-limited";

  const res = await (deps.fetchImpl ?? fetch)(
    `https://api.github.com/repos/${config.repo}/actions/workflows/${config.workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: config.ref,
        inputs: {
          plan_football_data: "true",
          plan_odds: "true",
          plan_predictions: "true",
          plan_bet_builder: "true",
        },
      }),
    },
  );
  // 204 No Content: avvio accettato.
  return res.status === 204 ? "dispatched" : "failed";
}
