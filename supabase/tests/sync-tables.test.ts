/**
 * Copia dei dati tra ambienti (ADR 0054): ogni tabella di `public` deve essere
 * classificata in scripts/sync/tables.sh. Una tabella nuova dimenticata non verrebbe
 * copiata (se è un dato calcistico) o, peggio, finirebbe copiata per sbaglio.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase } from "./harness";

const TABLES_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scripts",
  "sync",
  "tables.sh",
);

/** Legge un elenco `NOME=( ... )` dello script bash. */
function list(name: string): string[] {
  const text = readFileSync(TABLES_FILE, "utf8");
  const match = new RegExp(`^${name}=\\(([^)]*)\\)`, "m").exec(text);
  if (!match) throw new Error(`${name} non trovato in tables.sh`);
  return match[1]!.split(/\s+/).filter(Boolean);
}

let db: PGlite;
beforeAll(async () => {
  db = await createDatabase();
});

describe("copia tra ambienti", () => {
  it("ogni tabella di public è in uno e un solo elenco", async () => {
    const { rows } = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by 1",
    );
    const lists = [list("SYNC_TABLES"), list("SEED_ONLY_TABLES"), list("LOCAL_TABLES")];
    const listed = lists.flat();
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(rows.map((r) => r.tablename));
  });

  it("i dati personali non si copiano mai", () => {
    const copied = new Set([...list("SYNC_TABLES"), ...list("SEED_ONLY_TABLES")]);
    for (const personal of [
      "profiles",
      "user_roles",
      "bankrolls",
      "bankroll_movements",
      "bets",
      "personal_limits",
      "user_bet_slips",
      "user_bet_slip_selections",
      "ask_usage",
      "audit_logs",
      "invitations",
    ]) {
      expect(copied.has(personal)).toBe(false);
    }
  });
});
