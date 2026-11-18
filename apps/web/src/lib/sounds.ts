/**
 * Suoni dell'interfaccia (M8): brevi toni generati nel browser con la Web Audio API,
 * nessun file da scaricare. Spenti finché l'utente non li accende in _Preferenze_; la scelta
 * vale per il dispositivo (cookie `predictra-sounds`), perché il suono dipende da dove si è.
 *
 * Non sono mai l'unico segnale: il messaggio scritto c'è sempre. Volume basso e fisso; la
 * modalità silenziosa e il volume del telefono hanno sempre l'ultima parola.
 */

export type SoundKind = "success" | "error" | "tap" | "complete" | "notify";

/** Una nota: frequenza (Hz), inizio e durata (ms dall'avvio del suono). */
export interface Note {
  freq: number;
  start: number;
  duration: number;
}

/** Brevi e riconoscibili: salita = fatto, discesa = errore. Mai oltre mezzo secondo. */
export const SOUND_PATTERNS: Readonly<Record<SoundKind, readonly Note[]>> = {
  tap: [{ freq: 880, start: 0, duration: 40 }],
  success: [
    { freq: 660, start: 0, duration: 90 },
    { freq: 990, start: 90, duration: 140 },
  ],
  error: [
    { freq: 330, start: 0, duration: 120 },
    { freq: 247, start: 120, duration: 180 },
  ],
  notify: [
    { freq: 784, start: 0, duration: 80 },
    { freq: 1047, start: 100, duration: 120 },
  ],
  complete: [
    { freq: 523, start: 0, duration: 90 },
    { freq: 659, start: 90, duration: 90 },
    { freq: 784, start: 180, duration: 90 },
    { freq: 1047, start: 270, duration: 200 },
  ],
};

export const SOUND_COOKIE = "predictra-sounds";

/** Volume massimo di una nota (0–1): basso, un suono di conferma e non un allarme. */
export const SOUND_VOLUME = 0.06;

/** Vero se il cookie (intera stringa `document.cookie`) accende i suoni. */
export function soundsEnabled(cookieHeader: string): boolean {
  return cookieHeader.split(";").some((part) => part.trim() === `${SOUND_COOKIE}=on`);
}

/** Durata totale di un suono in millisecondi. */
export function soundDuration(kind: SoundKind): number {
  return Math.max(...SOUND_PATTERNS[kind].map((n) => n.start + n.duration));
}

let context: AudioContext | null = null;

/**
 * Suona `kind` se i suoni sono accesi su questo dispositivo. Non fa nulla sul server, senza
 * Web Audio o se il browser blocca l'audio (su iPhone serve un tocco prima del primo suono).
 */
export function playSound(kind: SoundKind, options: { force?: boolean } = {}): void {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
  if (!options.force && !soundsEnabled(document.cookie)) return;
  try {
    context ??= new window.AudioContext();
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    for (const note of SOUND_PATTERNS[kind]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const start = now + note.start / 1000;
      const end = start + note.duration / 1000;
      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, start);
      // Attacco e rilascio brevi: niente «clic» all'inizio e alla fine della nota.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(SOUND_VOLUME, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(context.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    // Audio non disponibile: l'interfaccia funziona uguale, il messaggio scritto c'è sempre.
  }
}

/** Accende o spegne i suoni su questo dispositivo (un anno). */
export function setSoundsEnabled(enabled: boolean): void {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${SOUND_COOKIE}=${enabled ? "on" : "off"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
}
