/**
 * Endpoint del ciclo QStash: configurazione, verifica della firma, budget, ciclo.
 * Le firme sono JWT HS256 nel formato di QStash, generate qui con chiavi DEMO.
 */
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CYCLE_PATH, handleCycleRequest, type CycleEndpointDeps } from "./endpoint";
import { WEB_HANDLERS } from "./handlers";
import { qstashKeysFromEnv, verifyQStashSignature } from "./qstash";
import type { AgentQueue } from "./worker";

const KEYS = { current: "sig_DEMO_CORRENTE", next: "sig_DEMO_PROSSIMA" };
const BASE = "https://predictra-demo.example";
const URL_CYCLE = `${BASE}${CYCLE_PATH}`;

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

function sign(
  key: string,
  body: string,
  over: Partial<{ sub: string; iss: string; exp: number; bodyHash: string }> = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: over.iss ?? "Upstash",
      sub: over.sub ?? URL_CYCLE,
      exp: over.exp ?? now + 300,
      nbf: now - 5,
      iat: now,
      jti: "demo",
      body: over.bodyHash ?? b64url(createHash("sha256").update(body).digest()),
    }),
  );
  const signature = b64url(createHmac("sha256", key).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

function request(body: string, signature?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("upstash-signature", signature);
  return new Request(URL_CYCLE, { method: "POST", body, headers });
}

class RecordingQueue implements AgentQueue {
  calls: string[] = [];
  quotaOk = true;
  async startRun() {
    this.calls.push("startRun");
    return 1;
  }
  async finishRun() {
    this.calls.push("finishRun");
  }
  async claim() {
    this.calls.push("claim");
    return [];
  }
  async extendLease() {}
  async complete() {}
  async fail() {
    return "failed";
  }
  async consumeQuota(provider: string, window: string, quota: number, cost: number) {
    this.calls.push(`quota:${provider}:${window}:${quota}:${cost}`);
    return this.quotaOk;
  }
}

function deps(queue: AgentQueue, over: Partial<CycleEndpointDeps> = {}): CycleEndpointDeps {
  return {
    keys: KEYS,
    baseUrl: BASE,
    queue: () => queue,
    handlers: WEB_HANDLERS,
    secrets: [],
    workerId: "vercel-demo",
    ...over,
  };
}

describe("chiavi QStash", () => {
  it("servono entrambe", () => {
    expect(qstashKeysFromEnv({})).toBeNull();
    expect(qstashKeysFromEnv({ QSTASH_CURRENT_SIGNING_KEY: "a" })).toBeNull();
    expect(
      qstashKeysFromEnv({ QSTASH_CURRENT_SIGNING_KEY: " a ", QSTASH_NEXT_SIGNING_KEY: "b" }),
    ).toEqual({ current: "a", next: "b" });
  });
});

describe("verifica della firma", () => {
  const body = '{"demo":true}';

  it("accetta la chiave corrente e la prossima (rotazione)", async () => {
    for (const key of [KEYS.current, KEYS.next]) {
      expect(
        await verifyQStashSignature(KEYS, { signature: sign(key, body), body, url: URL_CYCLE }),
      ).toBe(true);
    }
  });

  it("rifiuta firma assente, chiave sbagliata, corpo alterato, URL diverso, emittente diverso, scadenza", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const cases: [string | null, string, string][] = [
      [null, body, URL_CYCLE],
      [sign("sig_DEMO_ALTRA", body), body, URL_CYCLE],
      [sign(KEYS.current, body), '{"demo":false}', URL_CYCLE],
      [sign(KEYS.current, body), body, `${BASE}/api/jobs/altro`],
      [sign(KEYS.current, body, { sub: "https://altro.example/api/jobs/cycle" }), body, URL_CYCLE],
      [sign(KEYS.current, body, { iss: "Altro" }), body, URL_CYCLE],
      [sign(KEYS.current, body, { exp: past }), body, URL_CYCLE],
      ["non-un-jwt", body, URL_CYCLE],
    ];
    for (const [signature, b, url] of cases) {
      expect(await verifyQStashSignature(KEYS, { signature, body: b, url })).toBe(false);
    }
  });

  it("QSTASH_DEV non disattiva la verifica", async () => {
    const previous = process.env.QSTASH_DEV;
    process.env.QSTASH_DEV = "true";
    try {
      const forged = sign("sig_DEMO_ALTRA", body);
      expect(await verifyQStashSignature(KEYS, { signature: forged, body, url: URL_CYCLE })).toBe(
        false,
      );
    } finally {
      if (previous === undefined) delete process.env.QSTASH_DEV;
      else process.env.QSTASH_DEV = previous;
    }
  });
});

describe("POST /api/jobs/cycle", () => {
  it("senza chiavi risponde 503 e non tocca il database", async () => {
    const queue = new RecordingQueue();
    const res = await handleCycleRequest(request("{}"), deps(queue, { keys: null }));
    expect(res.status).toBe(503);
    expect(queue.calls).toEqual([]);
  });

  it("con firma assente o non valida risponde 401 e non tocca il database", async () => {
    const queue = new RecordingQueue();
    expect((await handleCycleRequest(request("{}"), deps(queue))).status).toBe(401);
    const forged = sign("sig_DEMO_ALTRA", "{}");
    expect((await handleCycleRequest(request("{}", forged), deps(queue))).status).toBe(401);
    expect(queue.calls).toEqual([]);
  });

  it("con firma valida conta il messaggio ed esegue un ciclo", async () => {
    const queue = new RecordingQueue();
    const res = await handleCycleRequest(request("{}", sign(KEYS.current, "{}")), deps(queue));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      run_id: 1,
      status: "succeeded",
      claimed: 0,
      qstash_within_budget: true,
    });
    expect(queue.calls).toEqual(["quota:qstash:day:600:1", "startRun", "claim", "finishRun"]);
  });

  it("oltre il budget giornaliero lo segnala ma esegue comunque il ciclo già pagato", async () => {
    const queue = new RecordingQueue();
    queue.quotaOk = false;
    const res = await handleCycleRequest(request("{}", sign(KEYS.next, "{}")), deps(queue));
    expect(await res.json()).toMatchObject({ qstash_within_budget: false, status: "succeeded" });
  });
});
