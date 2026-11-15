import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  APP_BASE_URL: z.url(),
});

/** Variabili solo server. L'import di "server-only" impedisce l'uso nel browser. */
export function serverEnv() {
  return serverSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    APP_BASE_URL: process.env.APP_BASE_URL,
  });
}
