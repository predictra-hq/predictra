import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Analisi delle schedine sui dati veri (ADR 0070): gira solo dal workflow «Verifica DEV»
 * con l'opzione `slip-analysis`, mai nei test normali. Stampa solo numeri aggregati.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./scripts/analysis/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["scripts/analysis/*.analysis.ts"],
    environment: "node",
    testTimeout: 900_000,
  },
});
