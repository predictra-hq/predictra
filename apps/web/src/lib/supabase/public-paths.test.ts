import { describe, expect, it } from "vitest";
import { isPublic } from "./proxy";

describe("percorsi pubblici", () => {
  it("la presentazione è pubblica, le pagine dell'app no", () => {
    expect(isPublic("/")).toBe(true);
    expect(isPublic("/dashboard")).toBe(false);
    expect(isPublic("/settings")).toBe(false);
  });

  it("login, recupero password e conferma del link restano pubblici", () => {
    expect(isPublic("/login")).toBe(true);
    expect(isPublic("/forgot-password")).toBe(true);
    expect(isPublic("/auth/confirm")).toBe(true);
    expect(isPublic("/loginx")).toBe(false);
  });
});
