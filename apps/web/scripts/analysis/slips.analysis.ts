/**
 * Analisi delle schedine (ADR 0070) sui dati di DEV, copia giornaliera di PROD.
 * Ricostruisce le schedine con le previsioni e le quote di PRIMA di ogni partita, le
 * confronta con i risultati e prova regole alternative. Stampa solo numeri aggregati:
 * nessun dato personale (il log del repository è pubblico).
 *
 * Onestà dei numeri (ADR 0075):
 * - gli intervalli al 95% vengono da un bootstrap a gruppi di schedine collegate da partite
 *   comuni: le schedine non sono indipendenti;
 * - delle griglie di regole alternative si mostra la distribuzione dei ritorni, non la
 *   variante migliore: con poche schedine per variante la migliore è soprattutto fortuna;
 * - nessuna regola si cambia da qui finché le partite già decise sono meno di
 *   MIN_INDEPENDENT (la riga «Campione» lo dice).
 */
const MIN_INDEPENDENT = 300;
import { createClient as supabaseClient } from "@supabase/supabase-js";
import { it } from "vitest";
import {
  BOLLETTA_PROFILES,
  BOLLETTA_RULES,
  buildBollette,
  exhaustiveLegs,
  marketConsensus,
  playablePicks,
  windowOf,
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
import { calibrationTest, clusteredBootstrap, pairedBrier, quantile } from "@/lib/analysis/stats";

type Results = ReadonlyMap<number, { home: number; away: number }>;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Distribuzione dei ritorni di una griglia di regole: mai la variante migliore da sola. */
function distribution(
  title: string,
  list: readonly { won: number; settled: number; roi: number }[],
): void {
  console.log(`\n== ${title}: ${list.length} varianti ==`);
  if (list.length === 0) return;
  const rois = list.map((x) => x.roi);
  const played = list.reduce((a, x) => a + x.settled, 0);
  const positive = rois.filter((r) => r > 0).length;
  console.log(
    `schedine per variante in media ${(played / list.length).toFixed(1)} · ritorno mediano ${pct(quantile(rois, 0.5))} · dal 10° al 90° percentile ${pct(quantile(rois, 0.1))} – ${pct(quantile(rois, 0.9))} · positive ${positive}/${list.length}`,
  );
  console.log(
    "Le varianti usano le stesse partite: la migliore non dimostra niente, conta la distribuzione.",
  );
}

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
    // Taratura di tutte le giocate insieme e confronto appaiato modello / mercato.
    const decided = pool.flatMap((p) => {
      const won = legWon(p, v.results);
      return won === null ? [] : [{ p, won }];
    });
    const cal = calibrationTest(decided.map(({ p, won }) => ({ probability: p.probability, won })));
    const decidedMatches = new Set(decided.map(({ p }) => p.matchId)).size;
    console.log(
      `\nCampione: ${decided.length} giocate decise su ${decidedMatches} partite; soglia per cambiare regole: ${MIN_INDEPENDENT} partite (${decidedMatches >= MIN_INDEPENDENT ? "raggiunta" : "non raggiunta"})`,
    );
    if (cal)
      console.log(
        `Taratura (probabilità usata): attese ${cal.expected.toFixed(1)}, uscite ${cal.observed}, z=${cal.z.toFixed(2)} (oltre ±2 è sospetta)`,
      );
    const paired = pairedBrier(
      decided
        .filter(({ p }) => p.marketProbability !== null)
        .map(({ p, won }) => ({ a: p.modelProbability, b: p.marketProbability!, won })),
    );
    if (paired)
      console.log(
        `Brier modello − mercato: ${paired.difference.toFixed(4)} ± ${(2 * paired.standardError).toFixed(4)} (n=${paired.n}; negativo = il modello indovina meglio)`,
      );

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
    distribution("Alternative (Solida, un profilo alla volta)", variants);

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
      distribution(
        `Quota totale ≥ ${targetPrice}`,
        high.filter((x) => x.label.includes(`quota≥${targetPrice} `)),
      );
    }

    // 8. Metodi per togliere il margine (ADR 0078): quale consenso del mercato indovina meglio
    //    l'1X2 delle partite giocate. In servizio resta il proporzionale finché i dati non
    //    bastano (ADR 0076); qui solo la misura, con la differenza partita per partita.
    {
      const methods = ["proportional", "power", "shin"] as const;
      const consensusBy = new Map(methods.map((m) => [m, marketConsensus(v.odds, m)]));
      const outcomeOf = (home: number, away: number) =>
        home > away ? "HOME" : home === away ? "DRAW" : "AWAY";
      const losses = new Map<string, number[]>(methods.map((m) => [m, []]));
      const briers = new Map<string, number[]>(methods.map((m) => [m, []]));
      for (const [matchId, r] of v.results) {
        const per = methods.map((m) =>
          (["HOME", "DRAW", "AWAY"] as const).map(
            (x) => consensusBy.get(m)!.get(`${matchId}|h2h|${x}`) ?? null,
          ),
        );
        if (per.some((ps) => ps.some((p) => p === null))) continue;
        const y = outcomeOf(r.home, r.away);
        methods.forEach((m, i) => {
          const ps = per[i]! as number[];
          const sum = ps.reduce((a, b) => a + b, 0);
          const probs = ps.map((p) => p / sum);
          const idx = ["HOME", "DRAW", "AWAY"].indexOf(y);
          losses.get(m)!.push(-Math.log(Math.max(probs[idx]!, 1e-15)));
          briers.get(m)!.push(probs.reduce((a, p, j) => a + (p - (j === idx ? 1 : 0)) ** 2, 0));
        });
      }
      const base = losses.get("proportional")!;
      console.log(`\n== Metodi del margine sull'1X2 (${base.length} partite) ==`);
      for (const m of methods) {
        const l = losses.get(m)!;
        const b = briers.get(m)!;
        const d = l.map((x, i) => x - base[i]!);
        const mean = d.reduce((a, x) => a + x, 0) / Math.max(1, d.length);
        const se =
          d.length > 1
            ? Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (d.length - 1) / d.length)
            : 0;
        console.log(
          `${m.padEnd(13)} LogLoss=${(l.reduce((a, x) => a + x, 0) / Math.max(1, l.length)).toFixed(4)}  Brier=${(b.reduce((a, x) => a + x, 0) / Math.max(1, b.length)).toFixed(4)}  diff=${mean >= 0 ? "+" : ""}${mean.toFixed(4)} ± ${(2 * se).toFixed(4)}`,
        );
      }
    }

    // 9. Ricerca esaustiva contro quella in servizio (ADR 0078): per periodo e profilo, la
    //    combinazione più probabile che arriva alla quota, contro quella costruita giocata per
    //    giocata. Profili indipendenti tra loro (in servizio una partita sta in una schedina
    //    sola per periodo): il confronto è indicativo.
    {
      const pool = playablePicks(rows, v.prices, v.consensus, undefined, calibration);
      for (const window of ["round", "day"] as const) {
        const built = buildBollette(rows, v.prices, v.consensus, calibration, { window });
        const periods = new Map<string, typeof pool>();
        for (const p of pool) {
          const k = windowOf(p.kickoffAt, window);
          periods.set(k, [...(periods.get(k) ?? []), p]);
        }
        console.log(`\n== Ricerca esaustiva contro quella in servizio (${window}) ==`);
        for (const profile of BOLLETTA_PROFILES) {
          const rule = BOLLETTA_RULES[profile];
          const current = built.filter((b) => b.profile === profile);
          const exhaustive = [...periods].flatMap(([round, list]) => {
            const legs = exhaustiveLegs(rule, list);
            if (!legs) return [];
            const probability = legs.reduce((a, p) => a + Math.log(p.probability), 0);
            const price = legs.reduce((a, p) => a * p.price, 1);
            return [
              {
                profile,
                round,
                picks: legs,
                probability: Math.exp(probability),
                price,
                oddsObservedAt: legs.map((p) => p.observedAt).sort()[0] ?? "",
                expectedValue: Math.exp(probability) * price - 1,
              },
            ];
          });
          const line = (list: typeof current) => {
            const s = score(list, v.results);
            const p = list.length ? list.reduce((a, b) => a + b.probability, 0) / list.length : 0;
            return `${list.length} schedine, data in media ${pct(p)}, vinte ${s.won}/${s.settled}, ritorno ${pct(s.roi)}`;
          };
          console.log(`${profile.padEnd(9)} in servizio: ${line(current)}`);
          console.log(`${"".padEnd(9)} esaustiva:   ${line(exhaustive)}`);
        }
      }
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
    // Ritorno medio puntando 1 su ognuna, con intervallo al 95% da bootstrap a gruppi di
    // schedine con partite comuni: dice quanto il risultato può dipendere dalla fortuna.
    type Return = { keys: string[]; value: number };
    const roiLine = (items: Return[]) => {
      const b = clusteredBootstrap(items);
      if (!b) return "nessuna";
      const won = items.filter((x) => x.value > 0).length;
      return `vinte ${won}/${b.n} (${pct(won / b.n)}) ritorno ${pct(b.mean)} [95%: da ${pct(b.low)} a ${pct(b.high)}; ${b.groups} gruppi indipendenti]`;
    };
    const proposalReturn = (p: SavedProposal, legs: (boolean | null)[]): Return => ({
      keys: p.bet_proposal_legs.map((l) => String(l.match_id)),
      value: legs.every(Boolean) ? Number(p.combined_price) - 1 : -1,
    });
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
    const groups = new Map<string, Return[]>();
    for (const { p, legs } of settledProposals) {
      const key = `${p.category} · ${p.legs_count} selezioni`;
      const r = proposalReturn(p, legs);
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
      const kept: Return[] = [];
      let expected = 0;
      for (const l of distinct.values()) {
        if (l.model_probability === null || l.market_probability === null) continue;
        const prob = (1 - w) * Number(l.model_probability) + w * Number(l.market_probability);
        if (prob * Number(l.price) - 1 < 0.02) continue;
        const won = legResult(l);
        kept.push({ keys: [String(l.match_id)], value: won ? Number(l.price) - 1 : -1 });
        expected += prob;
      }
      console.log(
        `peso mercato ${w.toFixed(2)}: data in media ${kept.length ? pct(expected / kept.length) : "—"} · ${roiLine(kept)}`,
      );
    }
    // Le stesse proposte, tenute solo se ogni giocata ha ancora valore con il peso dato.
    for (const w of [0.5, 0.75, 1]) {
      const kept: Return[] = [];
      for (const { p, legs } of settledProposals) {
        const ok = p.bet_proposal_legs.every((l) => {
          if (l.model_probability === null || l.market_probability === null) return false;
          const prob = (1 - w) * Number(l.model_probability) + w * Number(l.market_probability);
          return prob * Number(l.price) - 1 >= 0.02;
        });
        if (ok) kept.push(proposalReturn(p, legs));
      }
      console.log(`proposte con peso mercato ${w.toFixed(2)}: ${roiLine(kept)}`);
    }
  });
});
