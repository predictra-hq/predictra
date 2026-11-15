import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildConfirmUrl } = await import("./links");

describe("buildConfirmUrl", () => {
  it("costruisce il link di invito verso /auth/confirm", () => {
    const url = new URL(buildConfirmUrl("https://app.example", "invite", "abc123"));
    expect(url.origin).toBe("https://app.example");
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("invite");
    expect(url.searchParams.get("next")).toBe("/accept-invite");
  });

  it("instrada il recupero password su /reset-password", () => {
    const url = new URL(buildConfirmUrl("https://app.example/", "recovery", "x&y"));
    expect(url.searchParams.get("token_hash")).toBe("x&y");
    expect(url.searchParams.get("next")).toBe("/reset-password");
  });
});
