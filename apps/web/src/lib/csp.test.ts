import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce, supabaseOrigins } from "./csp";

describe("CSP con nonce", () => {
  it("nessun 'unsafe-inline' per gli script, nonce e strict-dynamic presenti", () => {
    const csp = buildCsp("abc123", { isDev: false, connect: ["https://x.supabase.co"] });
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://x.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("in sviluppo aggiunge solo 'unsafe-eval' (richiesto da React)", () => {
    const csp = buildCsp("n", { isDev: true, connect: [] });
    expect(csp).toContain("script-src 'self' 'nonce-n' 'strict-dynamic' 'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("nonce casuale, diverso a ogni chiamata", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });

  it("origini di Supabase per connect-src", () => {
    expect(supabaseOrigins("https://ref.supabase.co")).toEqual([
      "https://ref.supabase.co",
      "wss://ref.supabase.co",
    ]);
    expect(supabaseOrigins(undefined)).toEqual([]);
  });
});
