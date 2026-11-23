import { AVATAR_STYLES, isAvatarStyle, type AvatarStyle } from "@predictra/shared-types";

/**
 * Immagine del profilo: sempre nel verde di PREDICTRA, cambia solo il tipo di disegno
 * (scelta del proprietario, 18/11/2026). I colori sono token del tema (`positive`,
 * `on-positive`, `fg`…), quindi l'immagine si adatta al tema chiaro e scuro e i contrasti
 * sono quelli già verificati da `theme-contrast.test.ts`.
 *
 * - `classic`: simbolo sul cerchio verde (predefinito);
 * - `outline`: cerchio scuro con il bordo verde e il simbolo verde;
 * - `ball`: il pallone grande al centro, la linea di andamento sullo sfondo;
 * - `line`: solo la linea di andamento, spessa;
 * - `initial`: l'iniziale del nome con il pallone.
 */
export const DEFAULT_AVATAR_STYLE: AvatarStyle = "classic";

/** Tipo scelto, oppure il predefinito se manca o non è valido. */
export function avatarStyleOf(chosen: string | null | undefined): AvatarStyle {
  return isAvatarStyle(chosen) ? chosen : DEFAULT_AVATAR_STYLE;
}

/** Iniziale per il tipo `initial`: prima lettera del nome (o dell'email), maiuscola. */
export function avatarInitial(name: string | null | undefined): string {
  const letter = (name ?? "").trim().match(/\p{L}|\p{N}/u)?.[0];
  return letter ? letter.toLocaleUpperCase("it") : "P";
}

export { AVATAR_STYLES };
