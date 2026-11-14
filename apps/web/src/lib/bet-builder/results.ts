/*
 * Risultati delle proposte passate: quante sono uscite e quanto avrebbero reso
 * puntando sempre la stessa cifra, alle quote salvate nella proposta.
 *
 * Logica pura, nessun dato inventato:
 * - l'esito di una selezione viene dal risultato reale della partita (al 90', ADR 0034);
 * - una proposta è vinta se escono tutte le selezioni, persa se ne sbaglia una, in
 *   attesa finché manca un risultato;
 * - la stessa combinazione viene riproposta a ogni esecuzione del motore: si conta una
 *   volta sola, alla prima quota a cui è stata proposta.
 */

export type LegOutcome = "WON" | "LOST";
export type ProposalOutcome = "WON" | "LOST" | "PENDING";

export interface ResultLeg {
  match_id: number;
  market: string;
  line: number | null;
  selection: string;
}

export interface MatchScore {
  home: number;
  away: number;
}

/** Esito di una selezione dato il risultato; `null` se il mercato non è valutabile qui. */
export function legOutcome(leg: ResultLeg, score: MatchScore): LegOutcome | null {
  const { home, away } = score;
  const won = (ok: boolean): LegOutcome => (ok ? "WON" : "LOST");
  if (leg.market === "1X2") {
    if (leg.selection === "HOME") return won(home > away);
    if (leg.selection === "DRAW") return won(home === away);
    if (leg.selection === "AWAY") return won(home < away);
    return null;
  }
  if (leg.market === "DOUBLE_CHANCE") {
    if (leg.selection === "HOME_DRAW") return won(home >= away);
    if (leg.selection === "HOME_AWAY") return won(home !== away);
    if (leg.selection === "DRAW_AWAY") return won(home <= away);
    return null;
  }
  if (leg.market === "TOTAL_GOALS" && leg.line !== null) {
    const line = Number(leg.line);
    const total = home + away;
    // Solo linee .5: con le linee intere esiste il rimborso, qui non gestito.
    if (!Number.isFinite(line) || Number.isInteger(line)) return null;
    if (leg.selection === "OVER") return won(total > line);
    if (leg.selection === "UNDER") return won(total < line);
  }
  return null;
}

export interface PastProposal {
  id: number;
  category: string;
  created_at: string;
  last_kickoff_at: string;
  probability: number;
  combined_price: number;
  legs: ResultLeg[];
}

export interface SettledProposal extends PastProposal {
  outcome: ProposalOutcome;
}

/** Vinta se escono tutte, persa appena una è sbagliata, altrimenti in attesa. */
export function proposalOutcome(
  legs: readonly ResultLeg[],
  scores: ReadonlyMap<number, MatchScore>,
): ProposalOutcome {
  let pending = legs.length === 0;
  for (const leg of legs) {
    const score = scores.get(Number(leg.match_id));
    const outcome = score ? legOutcome(leg, score) : null;
    if (outcome === "LOST") return "LOST";
    if (outcome === null) pending = true;
  }
  return pending ? "PENDING" : "WON";
}

const signature = (legs: readonly ResultLeg[]) =>
  legs
    .map((l) => `${l.match_id}|${l.market}|${l.line === null ? "" : Number(l.line)}|${l.selection}`)
    .sort()
    .join(";");

/** Una riga per combinazione: la prima volta che è stata proposta. */
export function dedupeProposals(proposals: readonly PastProposal[]): PastProposal[] {
  const first = new Map<string, PastProposal>();
  for (const p of proposals) {
    const key = signature(p.legs);
    const current = first.get(key);
    if (
      !current ||
      p.created_at < current.created_at ||
      (p.created_at === current.created_at && p.id < current.id)
    ) {
      first.set(key, p);
    }
  }
  return [...first.values()];
}

export function settleProposals(
  proposals: readonly PastProposal[],
  scores: ReadonlyMap<number, MatchScore>,
): SettledProposal[] {
  return dedupeProposals(proposals)
    .map((p) => ({ ...p, outcome: proposalOutcome(p.legs, scores) }))
    .sort((a, b) => b.last_kickoff_at.localeCompare(a.last_kickoff_at) || b.id - a.id);
}

export interface ResultsSummary {
  /** Proposte con esito definitivo (vinte + perse). */
  settled: number;
  won: number;
  pending: number;
  /** Quota vinte, `null` senza proposte chiuse. */
  hitRate: number | null;
  /** Media delle probabilità stimate: quante ne aspettavamo. */
  expectedHitRate: number | null;
  averagePrice: number | null;
  /** Guadagno puntando 1 su ogni proposta chiusa. */
  profit: number;
  /** Rendimento: guadagno / totale puntato, `null` senza proposte chiuse. */
  yield: number | null;
}

export function summarize(proposals: readonly SettledProposal[]): ResultsSummary {
  const closed = proposals.filter((p) => p.outcome !== "PENDING");
  const won = closed.filter((p) => p.outcome === "WON");
  const n = closed.length;
  const profit = closed.reduce(
    (acc, p) => acc + (p.outcome === "WON" ? Number(p.combined_price) - 1 : -1),
    0,
  );
  return {
    settled: n,
    won: won.length,
    pending: proposals.length - n,
    hitRate: n ? won.length / n : null,
    expectedHitRate: n ? closed.reduce((acc, p) => acc + Number(p.probability), 0) / n : null,
    averagePrice: n ? closed.reduce((acc, p) => acc + Number(p.combined_price), 0) / n : null,
    profit,
    yield: n ? profit / n : null,
  };
}

/** Sotto questo numero di proposte chiuse il rendimento è quasi solo caso. */
export const MIN_SAMPLE = 100;
