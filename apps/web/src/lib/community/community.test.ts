import { describe, expect, it } from "vitest";
import { NAME_COLORS } from "@predictra/shared-types";
import { nameClasses, parseCommentBody, parseNameStyle, todayInRome } from "./community";

describe("dati dei moduli", () => {
  it("testo del commento tra 1 e 500 caratteri, senza spazi ai bordi", () => {
    expect(parseCommentBody("  ciao  ")).toBe("ciao");
    expect(parseCommentBody("   ")).toBeNull();
    expect(parseCommentBody("x".repeat(501))).toBeNull();
    expect(parseCommentBody(42)).toBeNull();
  });

  it("stile del nome solo dagli elenchi, altrimenti nessuno", () => {
    expect(parseNameStyle("violet", "italic")).toEqual({
      name_color: "violet",
      name_style: "italic",
    });
    expect(parseNameStyle("#ff0000", "default")).toEqual({ name_color: null, name_style: null });
  });
});

describe("aspetto del nome", () => {
  it("ogni colore ha la sua variabile, ignorati i valori sconosciuti", () => {
    for (const c of NAME_COLORS) expect(nameClasses(c, null)).toBe(`text-name-${c}`);
    expect(nameClasses("x", "y")).toBe("");
    expect(nameClasses(null, "caps")).toBe("uppercase tracking-wider");
  });

  it("data di oggi nel fuso di Roma", () => {
    expect(todayInRome(new Date("2026-11-17T23:30:00Z"))).toBe("2026-11-18");
  });
});
