/**
 * Regressione (lista utenti vuota): `user_roles` e `audit_logs` hanno più chiavi verso
 * `profiles`. Un embed senza `!nome_fkey` fa rispondere PostgREST con un errore di
 * ambiguità (PGRST201) e la pagina resta vuota.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("embed PostgREST verso profiles", () => {
  it("indicano sempre la chiave quando la relazione è ambigua", () => {
    const offenders = files(join(ROOT, "src")).flatMap((f) => {
      const source = readFileSync(f, "utf8");
      return [...source.matchAll(/\b(user_roles|profiles|actor:profiles)\(/g)].map(
        (m) => `${f.slice(ROOT.length)}: ${m[0]}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});
