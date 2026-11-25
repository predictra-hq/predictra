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
      for (const profile of Object.keys(BOLLETTA_RULES)) {
        const s = score(
          all.filter((b) => b.profile === profile),
          v.results,
        );
        console.log(`${profile.padEnd(9)} vinte ${s.won}/${s.settled} ritorno ${pct(s.roi)}`);
      }
    }

    // 3. Regole alternative: un profilo alla volta, per giornata e per turno.
    const variants: { label: string; won: number; settled: number; roi: number }[] = [];
    for (const window of ["day", "round"] as const) {
      for (const minProbability of [0.6, 0.65, 0.7, 0.75, 0.8, 0.85]) {
        for (const legs of [2, 3, 4]) {
          for (const minPrice of [1.15, 1.25, 1.35, 1.5]) {
            const rule: BollettaRule = { minProbability, minPrice, legs };
            const rules = { DOUBLE: rule, SOLID: rule, BALANCED: rule, HIGH: rule };
            const built = buildBollette(rows, v.prices, v.consensus, calibration, {
              window,
              rules,
            }).filter((b) => b.profile === "DOUBLE");
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

    // 4. Proposte con valore salvate dal motore.
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data } = await client
      .from("bet_proposals")
      .select(
        "id, category, legs_count, combined_price, first_kickoff_at, bet_proposal_legs(match_id, market, line, selection)",
      )
      .gte("first_kickoff_at", since)
      .lt("first_kickoff_at", new Date().toISOString())
      .limit(5000);
    const groups = new Map<string, { n: number; won: number; back: number }>();
    for (const p of (data ?? []) as {
      category: string;
      legs_count: number;
      combined_price: number;
      bet_proposal_legs: {
        match_id: number;
        market: string;
        line: number | null;
        selection: string;
      }[];
    }[]) {
      const legs = p.bet_proposal_legs.map((l) =>
        legWon(
          {
            matchId: l.match_id,
            market: l.market,
            line: l.line === null ? null : Number(l.line),
            selection: l.selection,
          },
          v.results,
        ),
      );
      if (legs.some((x) => x === null)) continue;
      const key = `${p.category} · ${p.legs_count} selezioni`;
      const g = groups.get(key) ?? { n: 0, won: 0, back: 0 };
      g.n += 1;
      if (legs.every(Boolean)) {
        g.won += 1;
        g.back += Number(p.combined_price);
      }
      groups.set(key, g);
    }
    console.log("\n== Proposte con valore degli ultimi 30 giorni ==");
    for (const [k, g] of [...groups].sort())
      console.log(
        `${k.padEnd(28)} vinte ${g.won}/${g.n} (${pct(g.won / g.n)}) ritorno ${pct(g.back / g.n - 1)}`,
      );
  });
});
