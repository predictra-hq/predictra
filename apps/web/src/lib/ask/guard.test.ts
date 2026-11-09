import { describe, expect, it } from "vitest";
import { checkNumbers, extractNumbers } from "./guard";

const data = JSON.stringify({
  rows: [
    { esito: "1 (casa)", probabilita: "45,2%", quota: "2,10" },
    { partita: "Inter – Milan", data: "22/11/2026 20:45" },
  ],
});

describe("estrazione dei numeri", () => {
  it("riconosce virgola e punto, ignora le cifre dentro le parole", () => {
    expect(
      extractNumbers("Prob. 45,2% e quota 2.10 sul mercato 1X2, milestone M8").map((t) => t.raw),
    ).toEqual(["45,2", "2.10"]);
    expect(extractNumbers("Over 2,5")[0]).toEqual({ raw: "2,5", value: 2.5, decimals: 1 });
  });
});

describe("controllo dei numeri", () => {
  it("accetta numeri presenti nei dati, anche arrotondati", () => {
    expect(
      checkNumbers("Il modello dà il segno 1 al 45,2% (circa 45%), quota 2,10.", [data]),
    ).toEqual({
      ok: true,
      unknown: [],
    });
    expect(checkNumbers("Si gioca il 22/11 alle 20:45.", [data]).ok).toBe(true);
  });

  it("scarta numeri inventati o calcolati", () => {
    expect(checkNumbers("Probabilità 47%, quota 2,10.", [data])).toEqual({
      ok: false,
      unknown: ["47"],
    });
    // Più decimali di quelli dei dati = numero non presente.
    expect(checkNumbers("Probabilità 45,23%", [data]).ok).toBe(false);
    // Una quota "equa" calcolata dall'LLM non è nei dati.
    expect(checkNumbers("Quota equa 2,21", [data]).unknown).toEqual(["2,21"]);
  });

  it("ammette i numeri della domanda dell'utente", () => {
    expect(
      checkNumbers("Ecco le ultime 5 partite.", [data, "Mostrami le ultime 5 partite"]).ok,
    ).toBe(true);
  });

  it("una risposta senza numeri passa sempre", () => {
    expect(checkNumbers("Non ho trovato dati su questa partita.", []).ok).toBe(true);
  });
});
