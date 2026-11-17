/**
 * Harness di test: Postgres embedded (PGlite, WASM) con un'emulazione minima
 * dell'ambiente Supabase (schema `auth`, ruoli `anon`/`authenticated`/
 * `service_role`, claim JWT) su cui vengono applicate le migrazioni reali.
 *
 * Non richiede Docker né rete. L'emulazione riproduce solo ciò da cui le
 * migrazioni dipendono: auth.users, auth.uid(), auth.jwt() e i privilegi
 * predefiniti di Supabase sullo schema public.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const SUPABASE_STUB = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "supabase-stub.sql"),
  "utf8",
);

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

export type Aal = "aal1" | "aal2";

export interface TestUser {
  id: string;
  email: string;
}

/** Crea un utente auth (il trigger crea profilo e preferenze). */
export async function createAuthUser(db: PGlite, email: string): Promise<TestUser> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return { id, email };
}

/** Assegna direttamente un ruolo (setup di test, come farebbe il bootstrap). */
export async function grantRole(db: PGlite, userId: string, role: string): Promise<void> {
  await db.query("insert into public.user_roles (user_id, role) values ($1, $2::public.app_role)", [
    userId,
    role,
  ]);
}

/**
 * Esegue `fn` impersonando un utente come farebbe PostgREST: ruolo
 * `authenticated` e claim JWT impostati nella transazione.
 */
export async function asUser<T>(
  db: PGlite,
  user: TestUser,
  fn: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>,
  aal: Aal = "aal2",
): Promise<T> {
  const claims = JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", aal });
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await tx.exec("set local role authenticated");
    return fn(tx as unknown as Pick<PGlite, "query" | "exec">);
  });
}

export async function asAnon<T>(
  db: PGlite,
  fn: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: "anon" }),
    ]);
    await tx.exec("set local role anon");
    return fn(tx as unknown as Pick<PGlite, "query" | "exec">);
  });
}

export async function asServiceRole<T>(
  db: PGlite,
  fn: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(tx as unknown as Pick<PGlite, "query" | "exec">);
  });
}

/**
 * Esegue una query che ci si aspetta fallisca, dentro un SAVEPOINT, così la
 * transazione di test resta utilizzabile. Restituisce il messaggio d'errore
 * (o `null` se la query è riuscita).
 */
export async function attempt(
  tx: Pick<PGlite, "query" | "exec">,
  sql: string,
  params: unknown[] = [],
): Promise<string | null> {
  await tx.exec("savepoint attempt");
  try {
    await tx.query(sql, params);
    await tx.exec("release savepoint attempt");
    return null;
  } catch (error) {
    await tx.exec("rollback to savepoint attempt");
    return error instanceof Error ? error.message : String(error);
  }
}
