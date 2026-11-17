import { describe, expect, it } from "vitest";
import { codeFromText, fillDigits } from "./code-digits";

const empty = ["", "", "", "", "", ""];

describe("codice a 6 cifre", () => {
  it("una cifra per casella, più cifre proseguono nelle caselle successive", () => {
    expect(fillDigits(empty, 0, "4")).toEqual(["4", "", "", "", "", ""]);
    expect(fillDigits(["4", "", "", "", "", ""], 1, "12")).toEqual(["4", "1", "2", "", "", ""]);
    expect(fillDigits(empty, 3, "")).toEqual(empty);
    expect(fillDigits(empty, 0, "a")).toEqual(empty);
  });

  it("un codice intero incollato in qualunque casella riempie tutte le caselle", () => {
    expect(fillDigits(empty, 4, "813463")).toEqual(["8", "1", "3", "4", "6", "3"]);
    expect(fillDigits(empty, 0, "813 463")).toEqual(["8", "1", "3", "4", "6", "3"]);
  });

  it("riconosce il codice dentro un testo copiato", () => {
    expect(codeFromText("813463")).toBe("813463");
    expect(codeFromText("813 463")).toBe("813463");
    expect(codeFromText("Il codice è 813-463, scade tra 30 secondi")).toBe("813463");
    expect(codeFromText("12345")).toBeNull();
    expect(codeFromText("telefono 3331234567")).toBeNull();
  });
});
