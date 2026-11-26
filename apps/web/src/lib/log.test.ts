import { afterEach, describe, expect, it, vi } from "vitest";
import { errorSummary, orFallback } from "./log";

describe("letture facoltative con errore registrato", () => {
  afterEach(() => vi.restoreAllMocks());

  it("restituisce il ripiego e registra l'errore con l'etichetta", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const value = await Promise.reject(new Error("timeout")).catch(orFallback("prova", []));
    expect(value).toEqual([]);
    expect(spy).toHaveBeenCalledWith("[predictra] lettura non riuscita (prova): Error: timeout");
  });

  it("riassume errori di Supabase, testi e valori strani, al massimo 300 caratteri", () => {
    expect(errorSummary({ message: "permission denied", code: "42501" })).toBe("permission denied");
    expect(errorSummary("x".repeat(400))).toHaveLength(300);
    expect(errorSummary(null)).toBe("null");
  });
});
