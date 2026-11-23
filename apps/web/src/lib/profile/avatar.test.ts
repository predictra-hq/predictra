import { describe, expect, it } from "vitest";
import { AVATAR_STYLES } from "@predictra/shared-types";
import { avatarInitial, avatarStyleOf, DEFAULT_AVATAR_STYLE } from "./avatar";

describe("immagine del profilo", () => {
  it("usa il tipo scelto; senza scelta o con un valore sconosciuto il classico", () => {
    for (const s of AVATAR_STYLES) expect(avatarStyleOf(s)).toBe(s);
    expect(avatarStyleOf(null)).toBe(DEFAULT_AVATAR_STYLE);
    expect(avatarStyleOf("teal")).toBe("classic");
  });

  it("l'iniziale è la prima lettera del nome, maiuscola", () => {
    expect(avatarInitial("alfredo")).toBe("A");
    expect(avatarInitial("  émile")).toBe("É");
    expect(avatarInitial("_x")).toBe("X");
    expect(avatarInitial("")).toBe("P");
    expect(avatarInitial(null)).toBe("P");
  });
});
