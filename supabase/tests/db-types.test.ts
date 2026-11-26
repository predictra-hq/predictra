/**
 * I tipi del database (`packages/shared-types/src/database.ts`) devono corrispondere alle
 * migrazioni. Se una migrazione aggiunge, toglie o rinomina una colonna, una vista o una
 * funzione, questo test fallisce finché non si rigenerano i tipi:
 *
 *   pnpm --filter @predictra/database gen:types
 *
 * Il confronto è un file snapshot di Vitest: in CI non si aggiorna mai da solo.
 */
import { describe, expect, it } from "vitest";
import { createDatabase } from "./harness";
import { generateDatabaseTypes } from "./db-types";

describe("tipi del database", () => {
  it("packages/shared-types/src/database.ts è aggiornato alle migrazioni", async () => {
    const db = await createDatabase();
    const generated = await generateDatabaseTypes(db);
    await db.close();
    await expect(generated).toMatchFileSnapshot("../../packages/shared-types/src/database.ts");
  });
});
