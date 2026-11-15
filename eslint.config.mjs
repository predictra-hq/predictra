// Configurazione ESLint per i pacchetti TypeScript non-Next (packages/*).
// L'app web usa la propria configurazione in apps/web/eslint.config.mjs.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
