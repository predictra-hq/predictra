/**
 * Analisi delle schedine (ADR 0070) sui dati di DEV, copia giornaliera di PROD.
 * Ricostruisce le schedine con le previsioni e le quote di PRIMA di ogni partita, le
 * confronta con i risultati e prova regole alternative. Stampa solo numeri aggregati:
 * nessun dato personale (il log del repository è pubblico).
 */
import { createClient as supabaseClient } from "@supabase/supabase-js";
import { it } from "vitest";
import {
  BOLLETTA_RULES,
  buildBollette,
  playablePicks,
  type BollettaPick,
  type BollettaRule,
} from "@/lib/bet-builder/bollette";
import { calibrationFrom } from "@/lib/bet-builder/calibration";
import type { LikelyRow } from "@/lib/bet-builder/likely";
import { settleBolletta } from "@/lib/bet-builder/past";
import { loadSlipVerification } from "@/lib/certainties/load";
import { settle } from "@/lib/certainties/logic";
import { getActiveHistoryCheck } from "@/lib/predictions/queries";
import { withServiceClient } from "@/lib/supabase/server";

type Results = ReadonlyMap<number, { home: number; away: number }>;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function legWon(p: Pick<BollettaPick, "matchId" | "market" | "line" | "selection">, r: Results) {
  const x = r.get(p.matchId);
  return x ? settle(p.market as never, p.line, p.selection, x.home, x.away) : null;
}

/** Schedine con regole date: vinte, giocate, ritorno puntando 1 su ognuna. */
function score(bollette: ReturnType<typeof buildBollette>, results: Results) {
  let won = 0;
  let settled = 0;
  let back = 0;
  for (const b of bollette) {
    const s = settleBolletta(b, results);
    if (s.outcome === "PENDING") continue;
    settled += 1;
    if (s.outcome === "WON") {
      won += 1;
      back += b.price;
    }
  }
  return { won, settled, roi: settled ? back / settled - 1 : 0 };
}

it("analisi delle schedine", async () => {
  const url = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`;
  const client = supabaseClient(url, process.env.SUPABASE_SECRET_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await withServiceClient(client, async () => {
    const v = await loadSlipVerification();
    const history = await getActiveHistoryCheck().catch(() => null);
    const calibration = calibrationFrom(history);
    const rows = v.rows as unknown as LikelyRow[];
    console.log(
      `Partite finite: ${v.results.size} · righe di previsione: ${rows.length} · celle storiche: ${calibration.size}`,
    );

    // 0. Il modello da solo, su tutte le previsioni prima della partita (senza quote).
    const model = new Map<string, { n: number; won: number; p: number }>();
    for (const r of v.rows) {
      const x = v.results.get(r.match_id);
      if (!x) continue;
      const won = settle(
        r.market,
        r.line === null ? null : Number(r.line),
        r.selection,
        x.home,
        x.away,
      );
      if (won === null) continue;
      const pr = Number(r.probability);
      const band = Math.min(9, Math.floor(pr * 10)) / 10;
      const key = `${r.market}${r.line === null ? "" : ` ${Number(r.line)}`} · da ${pct(band)}`;
      const c = model.get(key) ?? { n: 0, won: 0, p: 0 };
      c.n += 1;
      c.won += won ? 1 : 0;
      c.p += pr;
      model.set(key, c);
    }
    console.log("\n== Modello, tutte le previsioni dal 40%: data contro uscita ==");
    for (const [k, c] of [...model].sort()) {
      console.log(
        `${k.padEnd(34)} n=${String(c.n).padStart(4)} data=${pct(c.p / c.n)} uscita=${pct(c.won / c.n)}`,
      );
    }

    // 0b. Modello, mercato o un mix: quale indovina meglio (Brier, più basso è meglio)?
    const weights = [0, 0.25, 0.4, 0.5, 0.6, 0.75, 1];
    const brier = weights.map(() => ({ sum: 0, n: 0 }));
    for (const r of v.rows) {
      const x = v.results.get(r.match_id);
      if (!x) continue;
      const line = r.line === null ? null : Number(r.line);
      const won = settle(r.market, line, r.selection, x.home, x.away);
      const market = v.market(r);
      if (won === null || market === null || market === undefined) continue;
      weights.forEach((w, i) => {
        const p = (1 - w) * Number(r.probability) + w * market;
        brier[i]!.sum += (p - (won ? 1 : 0)) ** 2;
        brier[i]!.n += 1;
      });
    }
    console.log("\n== Peso del mercato: Brier (più basso è meglio) ==");
    weights.forEach((w, i) =>
      console.log(
        `peso mercato ${w.toFixed(2)}  n=${brier[i]!.n}  Brier=${(brier[i]!.sum / Math.max(1, brier[i]!.n)).toFixed(4)}`,
      ),
    );

    // 1. Singole giocate ammesse nelle schedine: probabilità data e uscite.
    const pool = playablePicks(rows, v.prices, v.consensus, undefined, calibration);
    const cells = new Map<string, { n: number; won: number; p: number }>();
    for (const p of pool) {
      const won = legWon(p, v.results);
      if (won === null) continue;
      const band = Math.min(9, Math.floor(p.probability * 10)) / 10;
      const key = `${p.market}${p.line === null ? "" : ` ${p.line}`} · da ${pct(band)}`;
      const c = cells.get(key) ?? { n: 0, won: 0, p: 0 };
      c.n += 1;
      c.won += won ? 1 : 0;
      c.p += p.probability;
      cells.set(key, c);
    }
    console.log("\n== Giocate ammesse: data contro uscita ==");
    for (const [k, c] of [...cells].sort()) {
      console.log(
        `${k.padEnd(34)} n=${String(c.n).padStart(4)} data=${pct(c.p / c.n)} uscita=${pct(c.won / c.n)}`,
      );
    }

    // 2. Regole attuali, per turno e per giornata.
    for (const window of ["round", "day"] as const) {
      const all = buildBollette(rows, v.prices, v.consensus, calibration, { window });
      console.log(`\n== Regole attuali (${window}) ==`);
      const periods = new Set(all.map((b) => b.round)).size;
      console.log(`periodi con almeno una schedina: ${periods}`);
      for (const profile of Object.keys(BOLLETTA_RULES)) {
        const list = all.filter((b) => b.profile === profile);
        const s = score(list, v.results);
        const avg = list.length ? list.reduce((a, b) => a + b.price, 0) / list.length : 0;
        const legs = list.length ? list.reduce((a, b) => a + b.picks.length, 0) / list.length : 0;
        console.log(
          `${profile.padEnd(9)} schedine ${list.length} · quota media ${avg.toFixed(2)} · partite ${legs.toFixed(1)} · vinte ${s.won}/${s.settled} ritorno ${pct(s.roi)}`,
        );
      }
    }

    // 3. Regole alternative: un profilo alla volta, per giornata e per turno.
    const variants: { label: string; won: number; settled: number; roi: number }[] = [];
    for (const window of ["day", "round"] as const) {
      for (const minProbability of [0.6, 0.65, 0.7, 0.75, 0.8, 0.85]) {
        for (const legs of [2, 3, 4]) {
          for (const minPrice of [1.15, 1.25, 1.35, 1.5]) {
            const rule: BollettaRule = { minProbability, minPrice, legs };
            const rules = { SOLID: rule, BALANCED: rule, HIGH: rule };
            const built = buildBollette(rows, v.prices, v.consensus, calibration, {
              window,
              rules,
            }).filter((b) => b.profile === "SOLID");
            const s = score(built, v.results);
            if (s.settled < 5) continue;
            variants.push({
              label: `${window} p≥${minProbability} quota≥${minPrice} ${legs} partite`,
              ...s,
            });
          }
        }
      }
    }
    const show = (title: string, list: typeof variants) => {
      console.log(`\n== ${title} ==`);
      for (const x of list.slice(0, 15))
        console.log(
          `${x.label.padEnd(42)} vinte ${x.won}/${x.settled} (${pct(x.won / x.settled)}) ritorno ${pct(x.roi)}`,
        );
    };
    show(
      "Alternative per percentuale di vincita",
      [...variants].sort((a, b) => b.won / b.settled - a.won / a.settled || b.settled - a.settled),
    );
    show(
      "Alternative per ritorno",
      [...variants].sort((a, b) => b.roi - a.roi),
    );

    // 5. Singole giocate per fascia di quota: quante escono e quanto rendono, con pesi del
    //    mercato diversi. Una schedina rende come il prodotto delle sue giocate.
    const bands = [1, 1.5, 2, 2.5, 3.5, 100];
    for (const w of [0.5, 0.75, 1]) {
      const legs = playablePicks(rows, v.prices, v.consensus, w, calibration);
      const t = new Map<string, { n: number; won: number; back: number; p: number }>();
      for (const p of legs) {
        const won = legWon(p, v.results);
        if (won === null) continue;
        const i = bands.findIndex((b, j) => p.price >= b && p.price < bands[j + 1]!);
        const key = `quota ${bands[i]}–${bands[i + 1] === 100 ? "oltre" : bands[i + 1]} · valore ${p.edge >= 0 ? "≥ 0" : "< 0"}`;
        const c = t.get(key) ?? { n: 0, won: 0, back: 0, p: 0 };
        c.n += 1;
        c.p += p.probability;
        if (won) {
          c.won += 1;
          c.back += p.price;
        }
        t.set(key, c);
      }
      console.log(`\n== Giocate per fascia di quota (peso mercato ${w}) ==`);
      for (const [k, c] of [...t].sort())
        console.log(
          `${k.padEnd(30)} n=${String(c.n).padStart(4)} data=${pct(c.p / c.n)} uscita=${pct(c.won / c.n)} ritorno ${pct(c.back / c.n - 1)}`,
        );
    }

    // 6. Schedine con quota totale minima obbligatoria (3, 5, 8, 12).
    const high: { label: string; won: number; settled: number; roi: number }[] = [];
    for (const window of ["round", "day"] as const) {
      for (const targetPrice of [3, 5, 8, 12]) {
        for (const minProbability of [0.35, 0.45, 0.55, 0.65]) {
          for (const minPrice of [1.3, 1.6, 2]) {
            for (const precision of [false, true]) {
              for (const marketWeight of [0.75, 1]) {
                const rule: BollettaRule = {
                  minProbability,
                  minPrice,
                  legs: 6,
                  targetPrice,
                  strictTarget: true,
                  precision,
                  minSlipValue: -0.15,
                };
                const rules = { SOLID: rule, BALANCED: rule, HIGH: rule };
                const built = buildBollette(rows, v.prices, v.consensus, calibration, {
                  window,
                  rules,
                  marketWeight,
                }).filter((b) => b.profile === "SOLID");
                const s = score(built, v.results);
                if (s.settled < 3) continue;
                high.push({
                  label: `${window} quota≥${targetPrice} p≥${minProbability} q≥${minPrice} ${precision ? "prob" : "valore"} w${marketWeight}`,
                  ...s,
                });
              }
            }
          }
        }
      }
    }
    for (const targetPrice of [3, 5, 8, 12]) {
      const list = high
        .filter((x) => x.label.includes(`quota≥${targetPrice} `))
        .sort((a, b) => b.roi - a.roi);
      const n = list.length;
      const wins = list.reduce((a, x) => a + x.won, 0);
      const played = list.reduce((a, x) => a + x.settled, 0);
      console.log(
        `\n== Quota totale ≥ ${targetPrice}: ${n} varianti, vinte in tutto ${wins}/${played} ==`,
      );
      for (const x of list.slice(0, 8))
        console.log(
          `${x.label.padEnd(54)} vinte ${x.won}/${x.settled} (${pct(x.won / x.settled)}) ritorno ${pct(x.roi)}`,
        );
    }

    // 4. Proposte con valore salvate dal motore, tutte quelle già giocate (a pagine di 1.000).
    interface SavedLeg {
      match_id: number;
      market: string;
      line: number | null;
      selection: string;
      price: number;
      model_probability: number | null;
      market_probability: number | null;
    }
    interface SavedProposal {
      category: string;
      legs_count: number;
      combined_price: number;
      first_kickoff_at: string;
      bet_proposal_legs: SavedLeg[];
    }
    const proposals: SavedProposal[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client
        .from("bet_proposals")
        .select(
          "id, category, legs_count, combined_price, first_kickoff_at, bet_proposal_legs(match_id, market, line, selection, price, model_probability, market_probability)",
        )
        .lt("first_kickoff_at", new Date().toISOString())
        .order("id")
        .range(from, from + 999);
      if (error) throw error;
      proposals.push(...((data ?? []) as unknown as SavedProposal[]));
      if (!data || data.length < 1000) break;
    }
    const legResult = (l: SavedLeg) =>
      legWon(
        {
          matchId: l.match_id,
          market: l.market,
          line: l.line === null ? null : Number(l.line),
          selection: l.selection,
        },
        v.results,
      );
    // Ritorno medio puntando 1 su ognuna, con intervallo al 95% (approssimazione normale):
    // dice quanto il risultato può dipendere dalla fortuna.
    const roiLine = (returns: number[]) => {
      const n = returns.length;
      if (n === 0) return "nessuna";
      const mean = returns.reduce((a, x) => a + x, 0) / n;
      const sd = Math.sqrt(returns.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, n - 1));
      const half = (1.96 * sd) / Math.sqrt(n);
      const won = returns.filter((x) => x > 0).length;
      return `vinte ${won}/${n} (${pct(won / n)}) ritorno ${pct(mean)} [95%: da ${pct(mean - half)} a ${pct(mean + half)}]`;
    };
    // Il motore gira più volte al giorno e ripropone spesso la stessa schedina: si conta una
    // volta sola (stesse giocate), con la prima quota proposta.
    const seenSlips = new Set<string>();
    const settledProposals = proposals
      .filter((p) => {
        const key = p.bet_proposal_legs
          .map((l) => `${l.match_id}|${l.market}|${l.line}|${l.selection}`)
          .sort()
          .join(",");
        if (seenSlips.has(key)) return false;
        seenSlips.add(key);
        return true;
      })
      .map((p) => ({ p, legs: p.bet_proposal_legs.map(legResult) }))
      .filter((x) => x.legs.length > 0 && x.legs.every((l) => l !== null));
    const firstDay = settledProposals.map((x) => x.p.first_kickoff_at).sort()[0] ?? "—";
    console.log(
      `\n== Proposte con valore già decise: ${settledProposals.length} distinte (${proposals.length} salvate), dal ${firstDay.slice(0, 10)} ==`,
    );
    const groups = new Map<string, number[]>();
    for (const { p, legs } of settledProposals) {
      const key = `${p.category} · ${p.legs_count} selezioni`;
      const r = legs.every(Boolean) ? Number(p.combined_price) - 1 : -1;
      groups.set(key, [...(groups.get(key) ?? []), r]);
      groups.set("TUTTE", [...(groups.get("TUTTE") ?? []), r]);
    }
    for (const [k, list] of [...groups].sort()) console.log(`${k.padEnd(28)} ${roiLine(list)}`);

    // 7. Peso del mercato nelle proposte: con probabilità e prezzi salvati, quali giocate
    //    avrebbero avuto valore (almeno +2%) con un altro peso, e come sono andate da singole.
    //    Ogni giocata una volta sola, anche se compare in più proposte.
    const distinct = new Map<string, SavedLeg>();
    for (const { p } of settledProposals)
      for (const l of p.bet_proposal_legs)
        distinct.set(`${l.match_id}|${l.market}|${l.line}|${l.selection}`, l);
    console.log(`\n== Giocate distinte delle proposte: ${distinct.size} ==`);
    for (const w of [0, 0.25, 0.5, 0.75, 0.9, 1]) {
      const kept: number[] = [];
      let expected = 0;
      for (const l of distinct.values()) {
        if (l.model_probability === null || l.market_probability === null) continue;
        const prob = (1 - w) * Number(l.model_probability) + w * Number(l.market_probability);
        if (prob * Number(l.price) - 1 < 0.02) continue;
        const won = legResult(l);
        kept.push(won ? Number(l.price) - 1 : -1);
        expected += prob;
      }
      console.log(
        `peso mercato ${w.toFixed(2)}: data in media ${kept.length ? pct(expected / kept.length) : "—"} · ${roiLine(kept)}`,
      );
    }
    // Le stesse proposte, tenute solo se ogni giocata ha ancora valore con il peso dato.
    for (const w of [0.5, 0.75, 1]) {
      const kept: number[] = [];
      for (const { p, legs } of settledProposals) {
        const ok = p.bet_proposal_legs.every((l) => {
          if (l.model_probability === null || l.market_probability === null) return false;
          const prob = (1 - w) * Number(l.model_probability) + w * Number(l.market_probability);
          return prob * Number(l.price) - 1 >= 0.02;
        });
        if (ok) kept.push(legs.every(Boolean) ? Number(p.combined_price) - 1 : -1);
      }
      console.log(`proposte con peso mercato ${w.toFixed(2)}: ${roiLine(kept)}`);
    }
  });
});
