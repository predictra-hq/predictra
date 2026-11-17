/**
 * Avatar predefinito (stile A, scelto il 17/11/2026): il simbolo di PREDICTRA in bianco su
 * un cerchio colorato, come gli avatar predefiniti di Discord. Il colore si ricava dall'id
 * dell'utente: è sempre lo stesso per la stessa persona e non serve salvarlo.
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

export function avatarColor(userId: string): (typeof AVATAR_COLORS)[number] {
  return AVATAR_COLORS[hash(userId) % AVATAR_COLORS.length]!;
}
