import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { chooseCompetition } from "./favorite";

const competitions = [
  { code: "DEMO1", name: "DEMO Uno" },
  { code: null, name: "DEMO senza codice" },
  { code: "DEMO2", name: "DEMO Due" },
];

describe("campionato da mostrare (valori DEMO)", () => {
  it("vince quello richiesto nell'indirizzo", () => {
    expect(chooseCompetition(competitions, "DEMO2", "DEMO1")?.name).toBe("DEMO Due");
  });
  it("senza richiesta si apre il preferito", () => {
    expect(chooseCompetition(competitions, null, "DEMO2")?.name).toBe("DEMO Due");
  });
  it("preferito non più presente o assente: il primo dell'elenco", () => {
    expect(chooseCompetition(competitions, null, "DEMO9")?.name).toBe("DEMO Uno");
    expect(chooseCompetition(competitions, null, null)?.name).toBe("DEMO Uno");
  });
  it("una competizione senza codice non viene scelta per errore", () => {
    expect(chooseCompetition([{ code: null, name: "x" }], null, null)?.name).toBe("x");
    expect(chooseCompetition(competitions, "ALTRO", null)?.name).toBe("DEMO Uno");
  });
  it("elenco vuoto", () => {
    expect(chooseCompetition([], "DEMO1", "DEMO1")).toBeUndefined();
  });
});
