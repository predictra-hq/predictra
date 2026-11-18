import { isAvatarColorKey, type AvatarColorKey } from "@predictra/shared-types";

/**
 * Avatar predefinito (stile A, scelto il 17/11/2026): il simbolo di PREDICTRA in bianco su
 * un cerchio colorato, come gli avatar predefiniti di Discord. Il colore si ricava dall'id
 * dell'utente, oppure è quello scelto nelle Preferenze (`profiles.avatar_color`).
 *
 * Ogni colore ha contrasto almeno 3:1 con il bianco (WCAG per gli elementi grafici).
 */
export const AVATAR_COLORS = [
  "#0f766e", // verde acqua
  "#534ab7", // viola
  "#c2410c", // arancio
  "#185fa5", // blu
  "#993556", // rosa
  "#3b6d11", // verde
] as const;

/** Hash FNV-1a a 32 bit: veloce, stabile tra server e browser. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Colore scelto nelle Preferenze (`profiles.avatar_color`), nello stesso ordine di `AVATAR_COLORS`. */
export const AVATAR_COLOR_BY_KEY: Readonly<Record<AvatarColorKey, (typeof AVATAR_COLORS)[number]>> =
  {
    teal: "#0f766e",
    violet: "#534ab7",
    orange: "#c2410c",
    blue: "#185fa5",
    pink: "#993556",
    green: "#3b6d11",
  };

/** Colore scelto dall'utente; senza scelta (o con un valore sconosciuto) quello ricavato dall'id. */
export function avatarColor(
  userId: string,
  chosen?: string | null,
): (typeof AVATAR_COLORS)[number] {
  if (isAvatarColorKey(chosen)) return AVATAR_COLOR_BY_KEY[chosen];
  return AVATAR_COLORS[hash(userId) % AVATAR_COLORS.length]!;
}
