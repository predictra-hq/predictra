import { describe, expect, it } from "vitest";
import { NAME_COLORS } from "@predictra/shared-types";
import {
  ageOn,
  isAdult,
  nameClasses,
  parseBirthDate,
  parseCommentBody,
  parseNameStyle,
  todayInRome,
} from "./community";

describe("età e maggiore età", () => {
  it("conta gli anni compiuti, anche il giorno del compleanno", () => {
    expect(ageOn("2008-11-17", "2026-11-17")).toBe(18);
    expect(ageOn("2008-11-18", "2026-11-17")).toBe(17);
    expect(ageOn("2008-12-01", "2026-11-17")).toBe(17);
  });

  it("senza data non si è maggiorenni", () => {
    expect(isAdult(null, "2026-11-17")).toBe(false);
    expect(isAdult("1990-01-01", "2026-11-17")).toBe(true);
    expect(isAdult("2010-01-01", "2026-11-17")).toBe(false);
  });
});

describe("dati dei moduli", () => {
  it("accetta solo date vere, non nel futuro e dal 1900", () => {
    expect(parseBirthDate("1990-05-10", "2026-11-17")).toBe("1990-05-10");
    expect(parseBirthDate("1990-02-30", "2026-11-17")).toBeNull();
    expect(parseBirthDate("2027-01-01", "2026-11-17")).toBeNull();
    expect(parseBirthDate("1899-12-31", "2026-11-17")).toBeNull();
    expect(parseBirthDate("10/05/1990", "2026-11-17")).toBeNull();
  });

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
