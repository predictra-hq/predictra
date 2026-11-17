import { describe, expect, it } from "vitest";
import { totpIssuer } from "./totp";

describe("nome nell'app di autenticazione", () => {
  it("PREDICTRA in produzione, PREDICTRA DEV sugli ambienti di prova", () => {
    expect(totpIssuer("https://predictra-prod.vercel.app")).toBe("PREDICTRA");
    expect(totpIssuer("https://predictra.it")).toBe("PREDICTRA");
    expect(totpIssuer("https://predictra-dev.vercel.app")).toBe("PREDICTRA DEV");
    expect(totpIssuer("http://localhost:3000")).toBe("PREDICTRA DEV");
    expect(totpIssuer(undefined)).toBe("PREDICTRA");
    expect(totpIssuer("non un url")).toBe("PREDICTRA");
  });
});
