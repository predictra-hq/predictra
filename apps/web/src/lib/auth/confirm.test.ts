import { describe, expect, it } from "vitest";
import { parseConfirmRequest } from "./confirm";

const from = (values: Record<string, unknown>) => (name: string) => values[name];

describe("link di conferma", () => {
  it("invito: destinazione predefinita /accept-invite", () => {
    expect(parseConfirmRequest(from({ token_hash: "abc", type: "invite" }))).toEqual({
      tokenHash: "abc",
      type: "invite",
      next: "/accept-invite",
    });
  });

  it("recupero password: destinazione predefinita /reset-password", () => {
    expect(parseConfirmRequest(from({ token_hash: "abc", type: "recovery" }))?.next).toBe(
      "/reset-password",
    );
  });

  it("accetta solo destinazioni interne", () => {
    const parse = (next: string) =>
      parseConfirmRequest(from({ token_hash: "abc", type: "invite", next }))?.next;
    expect(parse("/settings/security")).toBe("/settings/security");
    expect(parse("https://altro.example")).toBe("/accept-invite");
    expect(parse("//altro.example")).toBe("/accept-invite");
  });

  it("rifiuta token mancante, troppo lungo o tipo non previsto", () => {
    expect(parseConfirmRequest(from({ type: "invite" }))).toBeNull();
    expect(parseConfirmRequest(from({ token_hash: "", type: "invite" }))).toBeNull();
    expect(parseConfirmRequest(from({ token_hash: "a".repeat(257), type: "invite" }))).toBeNull();
    expect(parseConfirmRequest(from({ token_hash: "abc", type: "signup" }))).toBeNull();
    expect(parseConfirmRequest(from({ token_hash: ["a", "b"], type: "invite" }))).toBeNull();
  });
});
