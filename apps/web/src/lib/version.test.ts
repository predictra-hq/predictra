import { describe, expect, it } from "vitest";
import { isNewerDeploy } from "./version";

describe("avviso di nuova versione", () => {
  it("compare solo se il server pubblica una versione diversa", () => {
    expect(isNewerDeploy("abc123", "def456")).toBe(true);
    expect(isNewerDeploy("abc123", "abc123")).toBe(false);
  });
  it("non compare in locale", () => {
    expect(isNewerDeploy("local", "def456")).toBe(false);
    expect(isNewerDeploy("abc123", "local")).toBe(false);
  });
  it("non compare con una risposta mancante o non valida", () => {
    expect(isNewerDeploy("abc123", undefined)).toBe(false);
    expect(isNewerDeploy("abc123", "")).toBe(false);
    expect(isNewerDeploy("abc123", 42)).toBe(false);
    expect(isNewerDeploy("abc123", null)).toBe(false);
  });
});
