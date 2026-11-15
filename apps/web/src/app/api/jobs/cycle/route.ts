import "server-only";
import { randomUUID } from "node:crypto";
import { dispatchConfigFromEnv, dispatchIfMissed } from "@/lib/agent/dispatch";
import { handleCycleRequest } from "@/lib/agent/endpoint";
import { WEB_HANDLERS } from "@/lib/agent/handlers";
import { qstashKeysFromEnv } from "@/lib/agent/qstash";
import { supabaseQueue } from "@/lib/agent/queue";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Ciclo leggero dell'agente, chiamato da QStash (ADR 0035 §1). Nessuna sessione
 * utente: l'autorizzazione è la firma QStash, verificata prima di qualsiasi
 * accesso al database. Il proxy della sessione esclude /api/jobs/*.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby: funzioni fino a 300 s (ADR 0002). Il ciclo si ferma prima (240 s).
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const { APP_BASE_URL, SUPABASE_SECRET_KEY } = serverEnv();
  const dispatchConfig = dispatchConfigFromEnv();
  try {
    return await handleCycleRequest(request, {
      keys: qstashKeysFromEnv(),
      baseUrl: APP_BASE_URL.replace(/\/+$/, ""),
      queue: () => supabaseQueue(createAdminClient()),
      handlers: WEB_HANDLERS,
      secrets: [SUPABASE_SECRET_KEY, ...(dispatchConfig ? [dispatchConfig.token] : [])],
      workerId: `vercel-${request.headers.get("upstash-message-id") ?? randomUUID()}`,
      watchdog: async () => {
        const { data, error } = await createAdminClient().rpc("agent_watchdog");
        if (error) throw new Error("agent_watchdog");
        return Number(data ?? 0);
      },
      fallback: () =>
        dispatchIfMissed({
          config: dispatchConfig,
          lastGithubRun: async () => {
            const { data, error } = await createAdminClient()
              .from("v_agent_status")
              .select("last_run_at")
              .eq("source", "github_actions")
              .maybeSingle();
            if (error) throw new Error("v_agent_status");
            return (data?.last_run_at as string | null | undefined) ?? null;
          },
          consumeQuota: (provider, quota) =>
            supabaseQueue(createAdminClient()).consumeQuota(provider, "hour", quota, 1),
        }),
    });
  } catch {
    // Nessun dettaglio nella risposta: l'esito del ciclo, se iniziato, è in agent_runs.
    return Response.json({ error: "Errore interno" }, { status: 500 });
  }
}
