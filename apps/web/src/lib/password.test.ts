import { describe, expect, it } from "vitest";
import { passwordChecks } from "./password";
import { newPasswordSchema } from "./validation";

describe("requisiti della password", () => {
  it("controlli che si aggiornano mentre si scrive", () => {
    expect(passwordChecks("123456789012", "")).toEqual({
      length: true,
      letter: false,
      digit: true,
      match: false,
    });
    expect(passwordChecks("passwordsicura9", "passwordsicura9")).toEqual({
      length: true,
      letter: true,
      digit: true,
      match: true,
    });
    expect(passwordChecks("", "").match).toBe(false);
  });

  it("il server rifiuta con un messaggio breve in italiano", () => {
    const onlyDigits = newPasswordSchema.safeParse({
      password: "123456789012",
      confirm: "123456789012",
    });
    expect(onlyDigits.success).toBe(false);
    expect(onlyDigits.error?.issues[0]?.message).toMatch(/lettera e un numero/);
    expect(
      newPasswordSchema.safeParse({ password: "passwordsicura9", confirm: "passwordsicura9" })
        .success,
    ).toBe(true);
  });
});
