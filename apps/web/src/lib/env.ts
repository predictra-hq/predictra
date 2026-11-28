import { z } from "zod";

/**
 * Variabili d'ambiente pubbliche (esposte al browser). Solo URL e chiave
 * "publishable" di Supabase: nessun segreto può avere prefisso NEXT_PUBLIC_.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

/**
 * Link per sostenere PREDICTRA con una donazione (ADR 0081), es. una pagina PayPal.me o
 * Ko-fi del proprietario. Solo lato server, solo `https`. Senza la variabile il pulsante
 * non compare: la piattaforma non incassa nulla e non inventa indirizzi.
 */
export function donationUrl(): string | null {
  const parsed = z.url({ protocol: /^https$/ }).safeParse(process.env.DONATION_URL?.trim());
  return parsed.success ? parsed.data : null;
}

export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
