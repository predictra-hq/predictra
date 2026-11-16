import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isNeverActivated } = await import("./orphans");

describe("utente mai attivato", () => {
  it("senza ruoli e senza inviti accettati si può rimuovere", () => {
    expect(isNeverActivated({ roles: 0, acceptedInvitations: 0 })).toBe(true);
  });

  it("con un ruolo o un invito accettato resta", () => {
    expect(isNeverActivated({ roles: 1, acceptedInvitations: 0 })).toBe(false);
    expect(isNeverActivated({ roles: 0, acceptedInvitations: 1 })).toBe(false);
  });

  it("se un conteggio manca non si rimuove nulla", () => {
    expect(isNeverActivated({ roles: null, acceptedInvitations: 0 })).toBe(false);
    expect(isNeverActivated({ roles: 0, acceptedInvitations: null })).toBe(false);
  });
});
