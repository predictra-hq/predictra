/**
 * Siti di scommesse italiani più diffusi, da scegliere come "sito dove giochi" anche quando
 * PREDICTRA non ne raccoglie le quote: la fonte (The Odds API, regione `eu`) offre oggi
 * solo poche versioni italiane (es. Codere). Per questi siti si mostra la migliore quota
 * italiana raccolta, che si corregge quando si registra la giocata. Solo nomi, nessuna quota.
 */
export const ITALIAN_SITES = [
  "888sport",
  "Bet365",
  "Betfair",
  "Betflag",
  "Better",
  "Eurobet",
  "Goldbet",
  "LeoVegas",
  "Lottomatica",
  "NetBet",
  "Planetwin365",
  "Sisal",
  "Snai",
  "StarCasinò Sport",
  "Unibet",
  "William Hill",
] as const;

/** Prefisso del valore scelto nell'elenco per un sito senza quote raccolte. */
export const SITE_PREFIX = "site:";

const norm = (v: string) => v.toLowerCase().replace(/\(it\)|[^a-z0-9]/g, "");

/** Siti dell'elenco fisso che non sono già tra quelli con le quote raccolte. */
export function untrackedSites(tracked: readonly { title: string }[]): string[] {
  const seen = new Set(tracked.map((b) => norm(b.title)));
  return ITALIAN_SITES.filter((s) => !seen.has(norm(s)));
}

/**
 * Valore del menu → codice del bookmaker raccolto oppure nome del sito. Un nome scritto a
 * mano vale solo se nel menu non si è scelto nulla.
 */
export function splitSiteChoice(
  code: FormDataEntryValue | null,
  name: FormDataEntryValue | null,
): { bookmakerCode: string | null; bookmakerName: string | null } {
  const c = typeof code === "string" ? code.trim() : "";
  const n = typeof name === "string" ? name.trim() : "";
  if (c.startsWith(SITE_PREFIX)) {
    const site = ITALIAN_SITES.find((s) => s === c.slice(SITE_PREFIX.length));
    return { bookmakerCode: null, bookmakerName: site ?? (n || null) };
  }
  return { bookmakerCode: c || null, bookmakerName: c ? null : n || null };
}
