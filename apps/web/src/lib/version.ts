/*
 * Versione dell'app in esecuzione: il commit da cui è stata costruita. `next.config.ts`
 * la fissa al momento della build (da `GITHUB_SHA`), quindi la pagina aperta nel browser
 * conosce la propria versione e `/api/version` quella pubblicata in questo momento.
 * In locale vale "local" e l'avviso di aggiornamento non compare mai.
 */
export const LOCAL_VERSION = "local";
export const APP_VERSION = process.env.APP_VERSION ?? LOCAL_VERSION;

/**
 * Versione mostrata agli utenti (es. «v1.0.0»; regole in docs/operations/interfaccia.md): il campo `version` di
 * `apps/web/package.json`, con il versionamento semantico (maggiore.minore.correzione).
 * Si aggiorna a mano nella PR che porta la novità. Il commit resta solo per l'avviso di
 * aggiornamento e non si mostra.
 */
export const APP_RELEASE = process.env.APP_RELEASE ?? "0.0.0";

/** «1.0.0» → «v1.0.0»; un valore non valido diventa «v0.0.0». */
export function formatRelease(release: string = APP_RELEASE): string {
  return /^\d+\.\d+\.\d+$/.test(release) ? `v${release}` : "v0.0.0";
}

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
