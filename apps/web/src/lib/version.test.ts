import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatRelease, isNewerDeploy } from "./version";

describe("versione mostrata", () => {
  it("numero di versione con la v davanti", () => {
    expect(formatRelease("1.0.0")).toBe("v1.0.0");
    expect(formatRelease("12.3.45")).toBe("v12.3.45");
  });

  it("un valore non valido non mostra testo strano", () => {
    expect(formatRelease("abc123")).toBe("v0.0.0");
    expect(formatRelease("")).toBe("v0.0.0");
  });

  it("package.json ha una versione maggiore.minore.correzione", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

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
