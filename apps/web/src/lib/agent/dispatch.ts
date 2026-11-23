/*
 * Avvio di riserva del ciclo Python (M7 fase A4, ADR 0035, punto aperto 1).
 *
 * Dal 23/11/2026 è l'unico avvio del ciclo Python (ADR 0061): lo schedule di GitHub, ogni
 * 3 ore e spesso in ritardo, consumava troppi minuti del piano gratuito. QStash chiama
 * l'endpoint ogni 15 minuti; a ogni fascia di `CYCLE_SLOTS_UTC` senza un ciclo
 * `github_actions` successivo, l'endpoint chiede a GitHub di avviare il workflow
 * _Agent (Python)_ (`workflow_dispatch`, con tutte le pianificazioni). Tre cicli al
 * giorno bastano: quote e previsioni del mattino, quote pre-partita e previsioni del
 * pomeriggio, risultati della sera. Al massimo un avvio l'ora (contatore `github-dispatch`).
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

/**
 * Fasce del ciclo Python (ora UTC, minuto): mattino dopo le 06 (quote `daily`, previsioni
 * `morning`, schedine `morning`), pomeriggio dopo le 15 (quote `prematch`, previsioni
 * `afternoon`, schedine `evening`), sera dopo le 22 (risultati delle partite serali).
 */
export const CYCLE_SLOTS_UTC: readonly (readonly [number, number])[] = [
  [6, 50],
  [15, 50],
  [22, 50],
];
export const DISPATCH_QUOTA_PER_HOUR = 1;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Ultima fascia già iniziata rispetto a `now` (anche del giorno prima). */
export function latestSlot(now: number): number {
  const day = new Date(now);
  const candidates = [0, 1].flatMap((back) =>
    CYCLE_SLOTS_UTC.map(([h, m]) =>
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - back, h, m),
    ),
  );
  return Math.max(...candidates.filter((t) => t <= now));
}

export function dispatchConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): DispatchConfig | null {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) return null;
  const repo = env.GITHUB_DISPATCH_REPO?.trim() || "predictra-hq/predictra";
  if (!REPO_RE.test(repo)) return null;
  // Branch da avviare: `dev` su DEV, `main` su PROD (ADR 0055: con PROD in servizio
  // solo `main` raccoglie dati). Qualunque altro valore resta `dev`.
  const ref = env.GITHUB_DISPATCH_REF?.trim() === "main" ? "main" : "dev";
  return { token, repo, workflow: "agent-python.yml", ref };
}

/** `true` se dopo l'ultima fascia iniziata non è ancora partito un ciclo GitHub Actions. */
export function cycleMissed(lastRunAt: string | null, now: number): boolean {
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  if (Number.isNaN(last)) return true;
  return last < latestSlot(now);
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
