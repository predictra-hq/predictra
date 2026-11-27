/**
 * Tutorial della prima entrata: una sequenza di passi, ognuno evidenzia una zona dell'app.
 * Il testo di ogni passo è in `it.ts` (`tour.steps`), con la stessa chiave `id`.
 *
 * `selector` indica gli elementi da evidenziare: si usa il primo visibile (sul telefono la
 * barra in basso, su schermi larghi il menu laterale). Se nessuno è visibile il passo
 * compare al centro dello schermo, senza evidenziare nulla.
 */
export interface TourStep {
  id: "welcome" | "home" | "bets" | "football" | "money" | "ask" | "profile";
  selector: string | null;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "welcome", selector: null },
  { id: "home", selector: 'a[href="/dashboard"]' },
  { id: "bets", selector: 'a[href="/certainties"]' },
  { id: "football", selector: 'a[href="/match-center"]' },
  { id: "money", selector: 'a[href="/accounts"]' },
  { id: "ask", selector: '[data-tour="ask"]' },
  { id: "profile", selector: 'a[href="/settings"]' },
];

/** Cookie di questo browser: «done» quando il tutorial è stato finito o saltato. */
export const TOUR_COOKIE = "predictra-tour";

/** Evento che riapre il tutorial (pulsante «Rivedi il tutorial» nel Profilo). */
export const TOUR_RESTART_EVENT = "predictra:tour";

/** Vero se il valore del cookie dice che il tutorial è già stato visto. */
export function isTourDone(cookieValue: string | undefined): boolean {
  return cookieValue === "done";
}

/** Chiave in `user_dashboard_settings.settings`: tutorial visto da questo utente. */
export const TOUR_SETTING = "tour_done";

/** Vero se le impostazioni personali dicono che il tutorial è già stato visto. */
export function isTourDoneInSettings(settings: unknown): boolean {
  return (
    typeof settings === "object" &&
    settings !== null &&
    (settings as Record<string, unknown>)[TOUR_SETTING] === true
  );
}

/** Impostazioni con il tutorial segnato come visto, senza perdere le altre chiavi. */
export function withTourDone(settings: unknown): Record<string, unknown> {
  const base =
    typeof settings === "object" && settings !== null && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  return { ...base, [TOUR_SETTING]: true };
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Dove mettere la scheda del passo: sotto la zona evidenziata se c'è spazio, altrimenti
 * sopra (es. la barra in basso sul telefono). Restituisce la distanza dal bordo alto.
 */
export function cardTop(target: Rect, cardHeight: number, viewportHeight: number): number {
  const gap = 12;
  const below = target.top + target.height + gap;
  if (below + cardHeight <= viewportHeight - gap) return below;
  return Math.max(gap, target.top - gap - cardHeight);
}
