import { describe, expect, it } from "vitest";
import { emailSchema, newPasswordSchema, safeNextPath, totpCodeSchema } from "./validation";

describe("safeNextPath", () => {
  it("accetta percorsi interni", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
  });

  it("rifiuta URL esterni e protocol-relative (open redirect)", () => {
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});

describe("validazione input", () => {
  it("normalizza le email", () => {
    expect(emailSchema.parse("  Mario.Rossi@Example.COM ")).toBe("mario.rossi@example.com");
  });

  it("rifiuta email non valide", () => {
    expect(emailSchema.safeParse("non-una-email").success).toBe(false);
  });

  it("richiede password di almeno 12 caratteri e coincidenti", () => {
    expect(newPasswordSchema.safeParse({ password: "corta", confirm: "corta" }).success).toBe(
      false,
    );
    expect(
      newPasswordSchema.safeParse({ password: "unapasswordlunga", confirm: "diversa-diversa" })
        .success,
    ).toBe(false);
    expect(
      newPasswordSchema.safeParse({ password: "unapasswordlunga", confirm: "unapasswordlunga" })
        .success,
    ).toBe(true);
  });

  it("accetta solo codici TOTP a 6 cifre", () => {
    expect(totpCodeSchema.safeParse("123456").success).toBe(true);
    expect(totpCodeSchema.safeParse("12345").success).toBe(false);
    expect(totpCodeSchema.safeParse("12a456").success).toBe(false);
  });
});
