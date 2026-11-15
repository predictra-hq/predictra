import { describe, expect, it } from "vitest";
import {
  canGrantRole,
  canManageAccount,
  hasPermission,
  highestRole,
  isRole,
  PERMISSIONS,
} from "./roles";

describe("ruoli e permessi", () => {
  it("SUPER_ADMIN ha tutti i permessi", () => {
    for (const p of PERMISSIONS) expect(hasPermission(["SUPER_ADMIN"], p)).toBe(true);
  });

  it("USER non ha permessi amministrativi", () => {
    for (const p of PERMISSIONS) expect(hasPermission(["USER"], p)).toBe(false);
  });

  it("ADMIN gestisce inviti e utenti ma non configurazioni globali né audit", () => {
    expect(hasPermission(["ADMIN"], "invitations.manage")).toBe(true);
    expect(hasPermission(["ADMIN"], "users.manage")).toBe(true);
    expect(hasPermission(["ADMIN"], "settings.global")).toBe(false);
    expect(hasPermission(["ADMIN"], "audit.read")).toBe(false);
  });

  it("highestRole sceglie il ruolo più alto", () => {
    expect(highestRole(["USER", "ADMIN"])).toBe("ADMIN");
    expect(highestRole([])).toBeNull();
  });

  it("isRole valida le stringhe", () => {
    expect(isRole("ADMIN")).toBe(true);
    expect(isRole("OWNER")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("assegnazione ruoli", () => {
  it("i SUPER_ADMIN possono creare altri SUPER_ADMIN (pari privilegi, nessun owner unico)", () => {
    expect(canGrantRole(["SUPER_ADMIN"], "SUPER_ADMIN")).toBe(true);
  });

  it("ADMIN può invitare solo USER", () => {
    expect(canGrantRole(["ADMIN"], "USER")).toBe(true);
    expect(canGrantRole(["ADMIN"], "ADMIN")).toBe(false);
    expect(canGrantRole(["ADMIN"], "SUPER_ADMIN")).toBe(false);
  });

  it("USER non può assegnare ruoli", () => {
    expect(canGrantRole(["USER"], "USER")).toBe(false);
    expect(canGrantRole([], "USER")).toBe(false);
  });
});

describe("gestione account", () => {
  it("nessuno può sospendere se stesso", () => {
    expect(canManageAccount(["SUPER_ADMIN"], ["SUPER_ADMIN"], true)).toBe(false);
  });

  it("SUPER_ADMIN gestisce chiunque altro", () => {
    expect(canManageAccount(["SUPER_ADMIN"], ["SUPER_ADMIN"], false)).toBe(true);
    expect(canManageAccount(["SUPER_ADMIN"], ["USER"], false)).toBe(true);
  });

  it("ADMIN gestisce solo ruoli inferiori", () => {
    expect(canManageAccount(["ADMIN"], ["USER"], false)).toBe(true);
    expect(canManageAccount(["ADMIN"], ["ADMIN"], false)).toBe(false);
    expect(canManageAccount(["ADMIN"], ["SUPER_ADMIN"], false)).toBe(false);
  });

  it("USER non gestisce account", () => {
    expect(canManageAccount(["USER"], ["USER"], false)).toBe(false);
  });
});
