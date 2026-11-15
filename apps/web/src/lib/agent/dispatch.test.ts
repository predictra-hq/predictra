/**
 * Avvio di riserva del ciclo Python (fase A4): quando avviare, limite orario,
 * chiamata a GitHub. Nessuna rete: `fetch` finto, token DEMO.
 */
import { describe, expect, it } from "vitest";
import {
  cycleMissed,
  dispatchConfigFromEnv,
  dispatchIfMissed,
  MISSED_AFTER_MINUTES,
  type FallbackDeps,
} from "./dispatch";

const NOW = Date.parse("2026-11-09T09:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const CONFIG = {
  token: "ghp_DEMO_NON_REALE",
  repo: "predictra-hq/predictra",
  workflow: "agent-python.yml",
  ref: "dev",
};

function fakeFetch(status = 204) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function deps(over: Partial<FallbackDeps> = {}): FallbackDeps {
  return {
    config: CONFIG,
    lastGithubRun: async () => minutesAgo(MISSED_AFTER_MINUTES + 5),
    consumeQuota: async () => true,
    now: () => NOW,
    ...over,
  };
}

describe("configurazione", () => {
  it("spento senza token", () => {
    expect(dispatchConfigFromEnv({})).toBeNull();
    expect(dispatchConfigFromEnv({ GITHUB_DISPATCH_TOKEN: "  " })).toBeNull();
  });
  it("repository predefinito e validazione", () => {
    expect(dispatchConfigFromEnv({ GITHUB_DISPATCH_TOKEN: "t" })).toEqual({
      token: "t",
      repo: "predictra-hq/predictra",
      workflow: "agent-python.yml",
      ref: "dev",
    });
    expect(
      dispatchConfigFromEnv({ GITHUB_DISPATCH_TOKEN: "t", GITHUB_DISPATCH_REPO: "x/y/../z" }),
    ).toBeNull();
  });
});

describe("ciclo saltato", () => {
  it("soglia di 3 h 30", () => {
    expect(cycleMissed(minutesAgo(200), NOW)).toBe(false);
    expect(cycleMissed(minutesAgo(211), NOW)).toBe(true);
    expect(cycleMissed(null, NOW)).toBe(true);
    expect(cycleMissed("non-una-data", NOW)).toBe(true);
  });
});

describe("dispatchIfMissed", () => {
  it("senza configurazione non fa nulla", async () => {
    const f = fakeFetch();
    expect(await dispatchIfMissed(deps({ config: null, fetchImpl: f.impl }))).toBe("disabled");
    expect(f.calls).toHaveLength(0);
  });

  it("ciclo recente: nessun avvio, nessun consumo", async () => {
    const f = fakeFetch();
    let consumed = 0;
    const outcome = await dispatchIfMissed(
      deps({
        lastGithubRun: async () => minutesAgo(30),
        consumeQuota: async () => {
          consumed += 1;
          return true;
        },
        fetchImpl: f.impl,
      }),
    );
    expect(outcome).toBe("not-needed");
    expect(consumed).toBe(0);
    expect(f.calls).toHaveLength(0);
  });

  it("al massimo un avvio l'ora", async () => {
    const f = fakeFetch();
    expect(
      await dispatchIfMissed(deps({ consumeQuota: async () => false, fetchImpl: f.impl })),
    ).toBe("rate-limited");
    expect(f.calls).toHaveLength(0);
  });

  it("avvia il workflow su dev con le pianificazioni dello schedule", async () => {
    const f = fakeFetch(204);
    let quotaArgs: unknown[] = [];
    const outcome = await dispatchIfMissed(
      deps({
        consumeQuota: async (...args) => {
          quotaArgs = args;
          return true;
        },
        fetchImpl: f.impl,
      }),
    );
    expect(outcome).toBe("dispatched");
    expect(quotaArgs).toEqual(["github-dispatch", 1]);
    const call = f.calls[0]!;
    expect(call.url).toBe(
      "https://api.github.com/repos/predictra-hq/predictra/actions/workflows/agent-python.yml/dispatches",
    );
    expect(call.init.method).toBe("POST");
    expect((call.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer ghp_DEMO_NON_REALE",
    );
    expect(JSON.parse(String(call.init.body))).toEqual({
      ref: "dev",
      inputs: {
        plan_football_data: "true",
        plan_odds: "true",
        plan_predictions: "true",
        plan_bet_builder: "true",
      },
    });
  });

  it("risposta diversa da 204: failed", async () => {
    const f = fakeFetch(403);
    expect(await dispatchIfMissed(deps({ fetchImpl: f.impl }))).toBe("failed");
  });
});
