import { describe, expect, it } from "vitest";
import { parseFollowInput } from "./follow-input";

const from = (values: Record<string, unknown>) => (name: string) => values[name];

describe("modulo del pulsante Segui", () => {
  it("squadra da seguire, campionato da lasciare", () => {
    expect(parseFollowInput(from({ kind: "team", id: "12", follow: "1" }))).toEqual({
      kind: "team",
      id: 12,
      follow: true,
    });
    expect(parseFollowInput(from({ kind: "competition", id: "3", follow: "0" }))).toEqual({
      kind: "competition",
      id: 3,
      follow: false,
    });
  });

  it("rifiuta tipi, identificativi e stati non previsti", () => {
    expect(parseFollowInput(from({ kind: "player", id: "1", follow: "1" }))).toBeNull();
    expect(parseFollowInput(from({ kind: "team", id: "0", follow: "1" }))).toBeNull();
    expect(parseFollowInput(from({ kind: "team", id: "1 or 1=1", follow: "1" }))).toBeNull();
    expect(parseFollowInput(from({ kind: "team", id: 5, follow: "1" }))).toBeNull();
    expect(parseFollowInput(from({ kind: "team", id: "5", follow: "yes" }))).toBeNull();
    expect(parseFollowInput(from({}))).toBeNull();
  });
});
