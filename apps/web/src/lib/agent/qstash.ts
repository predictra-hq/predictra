import { Receiver } from "@upstash/qstash";

/*
 * Verifica della firma delle richieste di QStash (ADR 0035 §1).
 *
 * QStash firma ogni chiamata con un JWT (header `Upstash-Signature`, HS256)
 * che contiene l'URL di destinazione (`sub`) e l'hash SHA-256 del corpo. La
 * verifica la fa l'SDK ufficiale, con due accortezze:
 *  - le chiavi si passano esplicitamente e `devMode: false`: così una variabile
 *    QSTASH_DEV impostata per errore non sostituisce le chiavi con quelle di
 *    sviluppo (che sono pubbliche);
 *  - l'URL atteso si ricava da APP_BASE_URL, non dalla richiesta.
 * Senza entrambe le chiavi l'endpoint non è configurato e non esegue nulla.
 */

export interface QStashKeys {
  current: string;
  next: string;
}

export function qstashKeysFromEnv(
  env: Record<string, string | undefined> = process.env,
): QStashKeys | null {
  const current = env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const next = env.QSTASH_NEXT_SIGNING_KEY?.trim();
  return current && next ? { current, next } : null;
}

export const SIGNATURE_HEADER = "upstash-signature";

/** `true` solo se la firma è valida per questo URL e questo corpo. Non lancia errori. */
export async function verifyQStashSignature(
  keys: QStashKeys,
  request: { signature: string | null; body: string; url: string },
): Promise<boolean> {
  if (!request.signature) return false;
  const receiver = new Receiver({
    currentSigningKey: keys.current,
    nextSigningKey: keys.next,
    devMode: false,
  });
  try {
    return await receiver.verify({
      signature: request.signature,
      body: request.body,
      url: request.url,
      clockTolerance: 5,
    });
  } catch {
    return false;
  }
}
