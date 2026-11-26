/*
 * Letture facoltative che non devono rompere la pagina (una card della Home, un riquadro
 * dell'agente): se falliscono si mostra il valore di ripiego, ma l'errore si registra nei
 * log del server. Prima un `.catch(() => null)` lo nascondeva: una policy RLS rotta o un
 * timeout in PROD sembravano «nessun dato».
 *
 * Nel log vanno solo l'etichetta e il tipo e il messaggio dell'errore, mai dati dell'utente.
 */

/** Riassunto sicuro di un errore: nome e messaggio, al massimo 300 caratteri. */
export function errorSummary(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 300);
  if (error && typeof error === "object" && "message" in error)
    return String((error as { message: unknown }).message).slice(0, 300);
  return String(error).slice(0, 300);
}

/**
 * Da usare in `.catch(orFallback("dashboard/cards: schedine", []))`: registra l'errore e
 * restituisce `fallback`.
 */
export function orFallback<T>(label: string, fallback: T): (error: unknown) => T {
  return (error: unknown) => {
    console.error(`[predictra] lettura non riuscita (${label}): ${errorSummary(error)}`);
    return fallback;
  };
}
