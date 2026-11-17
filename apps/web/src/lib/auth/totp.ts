/**
 * Nome con cui il codice di PREDICTRA compare nell'app di autenticazione (Google
 * Authenticator, 1Password, …). Senza, Supabase usa l'indirizzo del sito
 * (es. "predictra-prod.vercel.app: email"). DEV ha un nome diverso, così i due codici
 * non si confondono.
 */
export function totpIssuer(appBaseUrl: string | undefined): string {
  let host = "";
  try {
    host = appBaseUrl ? new URL(appBaseUrl).hostname : "";
  } catch {
    host = "";
  }
  return /(^|[.-])dev([.-]|$)|localhost/.test(host) ? "PREDICTRA DEV" : "PREDICTRA";
}
