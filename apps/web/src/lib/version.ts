/*
 * Versione dell'app in esecuzione: il commit da cui è stata costruita. `next.config.ts`
 * la fissa al momento della build (da `GITHUB_SHA`), quindi la pagina aperta nel browser
 * conosce la propria versione e `/api/version` quella pubblicata in questo momento.
 * In locale vale "local" e l'avviso di aggiornamento non compare mai.
 */
export const LOCAL_VERSION = "local";
export const APP_VERSION = process.env.APP_VERSION ?? LOCAL_VERSION;

/** Ogni quanto la pagina aperta chiede al server se c'è una versione nuova. */
export const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Vero se il server pubblica una versione diversa da quella della pagina aperta.
 * Una risposta mancante o non valida non fa mai comparire l'avviso.
 */
export function isNewerDeploy(current: string, published: unknown): boolean {
  if (typeof published !== "string" || published === "") return false;
  if (current === LOCAL_VERSION || published === LOCAL_VERSION) return false;
  return published !== current;
}
