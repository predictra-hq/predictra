import "server-only";
import type {
  ActiveBetProposalRow,
  ActivePredictionRow,
  BestOddsH2hRow,
  MatchCenterRow,
  ModelVersionSummaryRow,
  StandingRow,
  TeamFormRow,
  TeamSeasonStatsRow,
} from "@predictra/shared-types";
import { pickLabel } from "@/components/bet-builder/likely";
import { loadHomeCertainties } from "@/lib/certainties/load";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { formatOdds, formatPercent } from "@/lib/odds/format";
import { createClient } from "@/lib/supabase/server";
import type { ToolDefinition } from "./provider";
import { formatDecimal } from "@/lib/format/number";

/*
 * Strumenti in sola lettura di Ask PREDICTRA (ADR 0042 §1). Usano il client con la
 * sessione dell'utente, quindi la RLS. Nessun dato personale (bankroll, giocate).
 * I valori escono già formattati come nel resto dell'app: sono gli unici numeri
 * che l'LLM può citare (controllo in guard.ts).
 */

export interface ToolOutput {
  tool: string;
  title: string;
  /** Provenienza: fornitore, osservazione, versione del modello. */
  source: string | null;
  rows: Record<string, string>[];
}

const s = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value
    .replace(/[^\p{L}\p{N} '-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
};
const id = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const team = (name: string, short: string | null) => short ?? name;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "cerca_partite",
      description:
        "Cerca partite per nome di una squadra (anche parziale). Restituisce match_id, data, competizione, squadre, stato e risultato. Usalo prima degli altri strumenti sulle partite.",
      parameters: {
        type: "object",
        properties: {
          squadra: { type: "string", description: "Nome della squadra, es. Inter" },
          tipo: {
            type: "string",
            enum: ["prossime", "giocate"],
            description: "prossime = non ancora giocate; giocate = concluse",
          },
        },
        required: ["squadra", "tipo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "partite_campionato",
      description:
        "Partite di un campionato (es. Serie A, Champions League): le prossime in calendario oppure le ultime giocate con il risultato.",
      parameters: {
        type: "object",
        properties: {
          campionato: { type: "string", description: "Nome del campionato, es. Serie A" },
          tipo: { type: "string", enum: ["prossime", "giocate"] },
        },
        required: ["campionato", "tipo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "giocate_piu_probabili",
      description:
        "Le giocate più probabili dei prossimi 7 giorni su tutti i campionati (pagina Alta probabilità): partita, giocata e probabilità. Usalo per domande come: quali sono le giocate più probabili. Probabile non vuol dire conveniente: non presentarle come sicure né come giocate che convengono, perché la quota può pagare meno del giusto.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "previsioni_partita",
      description:
        "Probabilità del modello attivo per una partita (1X2, doppia chance, gol totali, entrambe segnano) con il Confidence Score.",
      parameters: {
        type: "object",
        properties: { match_id: { type: "integer" } },
        required: ["match_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quote_partita",
      description: "Migliori quote reali 1X2 di una partita tra i bookmaker raccolti.",
      parameters: {
        type: "object",
        properties: { match_id: { type: "integer" } },
        required: ["match_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "statistiche_squadra",
      description:
        "Statistiche della stagione IN CORSO di una squadra, una riga per competizione (campionato, coppe): posizione in classifica, partite, vittorie, pareggi, sconfitte, gol, punti, casa/trasferta, forma recente.",
      parameters: {
        type: "object",
        properties: { squadra: { type: "string" } },
        required: ["squadra"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "classifica",
      description: "Classifica attuale di un campionato, es. Serie A, Premier League.",
      parameters: {
        type: "object",
        properties: { campionato: { type: "string" } },
        required: ["campionato"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "modello_attivo",
      description: "Il modello di previsione attivo e le sue metriche di backtest.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "proposte",
      description:
        "Le schedine consigliate (pagina Analisi › Schedine › Proposte), la migliore per categoria.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "guida_app",
      description:
        "Guida all'uso di PREDICTRA: le sezioni del menu, i nomi esatti delle pagine, dove si trovano e a cosa servono. Per domande su come usare l'app o dove trovare qualcosa, e prima di indicare una pagina.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

/**
 * Righe della stagione in corso: per ogni squadra e competizione la stagione iniziata più
 * di recente, e solo le competizioni la cui stagione è dello stesso anno sportivo della più
 * recente (entro 200 giorni). Così non escono stagioni vecchie.
 */
export function currentSeasonRows<T extends { team_id: number; competition_id: number }>(
  rows: readonly T[],
  startOf: (row: T) => string | null,
): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const k = `${row.team_id}|${row.competition_id}`;
    const seen = latest.get(k);
    if (!seen || (startOf(row) ?? "") > (startOf(seen) ?? "")) latest.set(k, row);
  }
  const kept = [...latest.values()];
  const newest = kept.reduce((max, r) => ((startOf(r) ?? "") > max ? (startOf(r) ?? "") : max), "");
  if (!newest) return kept;
  const limit = new Date(new Date(newest).getTime() - 200 * 86_400_000).toISOString().slice(0, 10);
  return kept.filter((r) => (startOf(r) ?? "") >= limit);
}

const MARKETS_FOR_ASK = new Set(["1X2", "DOUBLE_CHANCE", "TOTAL_GOALS", "BTTS"]);
const TOTAL_LINES = new Set([1.5, 2.5, 3.5]);

export async function runTool(name: string, args: Record<string, unknown>): Promise<ToolOutput> {
  const m = getMessages();
  const t = m.ask.tools;
  const supabase = await createClient();
  const empty = (title: string): ToolOutput => ({ tool: name, title, source: null, rows: [] });

  switch (name) {
    case "cerca_partite": {
      const q = s(args.squadra);
      if (q.length < 2) return empty(t.matches);
      const upcoming = args.tipo !== "giocate";
      const like = `%${q}%`;
      let query = supabase
        .from("v_match_center")
        .select("*")
        .or(
          [
            `home_team_name.ilike.${like}`,
            `home_team_short_name.ilike.${like}`,
            `away_team_name.ilike.${like}`,
            `away_team_short_name.ilike.${like}`,
          ].join(","),
        );
      query = upcoming
        ? query
            .eq("status", "SCHEDULED")
            .gte("kickoff_at", new Date().toISOString())
            .order("kickoff_at")
        : query.eq("status", "FINISHED").order("kickoff_at", { ascending: false });
      const { data, error } = await query.limit(8);
      if (error) throw new Error(`Ask: ${name} (${error.code ?? "?"})`);
      const rows = (data ?? []) as MatchCenterRow[];
      return {
        tool: name,
        title: t.matches,
        source: rows[0] ? `${rows[0].provider_name}` : null,
        rows: rows.map((r) => ({
          match_id: String(r.match_id),
          [t.date]: formatDateTime(r.kickoff_at),
          [t.competition]: r.competition_name,
          [t.match]: `${team(r.home_team_name, r.home_team_short_name)} – ${team(r.away_team_name, r.away_team_short_name)}`,
          [t.status]: m.matchCenter.matchStatus[r.status] ?? r.status,
          ...(r.home_score !== null && r.away_score !== null
            ? { [t.score]: `${r.home_score}-${r.away_score}` }
            : {}),
        })),
      };
    }

    case "previsioni_partita": {
      const matchId = id(args.match_id);
      if (!matchId) return empty(t.predictions);
      const { data, error } = await supabase
        .from("v_active_predictions")
        .select("*")
        .eq("match_id", matchId)
        .limit(200);
      if (error) throw new Error(`Ask: ${name} (${error.code ?? "?"})`);
      const rows = ((data ?? []) as ActivePredictionRow[]).filter(
        (r) =>
          MARKETS_FOR_ASK.has(r.market) &&
          (r.market !== "TOTAL_GOALS" || TOTAL_LINES.has(Number(r.line))),
      );
      const first = rows[0];
      return {
        tool: name,
        title: first
          ? `${t.predictions}: ${first.home_team_name} – ${first.away_team_name}`
          : t.predictions,
        source: first ? `${t.model} ${first.model_key} ${first.model_version}` : null,
        rows: rows.map((r) => ({
          [t.market]:
            m.predictions.markets[r.market] +
            (r.line !== null ? ` ${String(r.line).replace(".", ",")}` : ""),
          [t.selection]:
            m.predictions.selections[r.selection as keyof typeof m.predictions.selections] ??
            r.selection,
          [t.probability]: formatPercent(Number(r.probability)),
          [t.confidence]: formatPercent(Number(r.confidence_score), 0),
        })),
      };
    }

    case "quote_partita": {
      const matchId = id(args.match_id);
      if (!matchId) return empty(t.odds);
      const { data, error } = await supabase
        .from("v_best_odds_h2h")
        .select("*")
        .eq("match_id", matchId)
        .limit(1);
      if (error) throw new Error(`Ask: ${name} (${error.code ?? "?"})`);
      const r = (data ?? [])[0] as BestOddsH2hRow | undefined;
      if (!r) return empty(t.odds);
      return {
        tool: name,
        title: `${t.odds}: ${r.home_team_name} – ${r.away_team_name}`,
        source: `The Odds API · ${t.observed} ${formatDateTime(r.observed_at)} · ${r.bookmakers} bookmaker`,
        rows: [
          {
            [t.selection]: "1",
            [t.price]: formatOdds(Number(r.best_home_price)),
            [t.bookmaker]: r.best_home_bookmaker,
          },
          {
            [t.selection]: "X",
            [t.price]: formatOdds(Number(r.best_draw_price)),
            [t.bookmaker]: r.best_draw_bookmaker,
          },
          {
            [t.selection]: "2",
            [t.price]: formatOdds(Number(r.best_away_price)),
            [t.bookmaker]: r.best_away_bookmaker,
          },
        ],
      };
    }

    case "statistiche_squadra": {
      const q = s(args.squadra);
      if (q.length < 2) return empty(t.teamStats);
      const { data, error } = await supabase
        .from("v_team_season_stats")
        .select("*")
        .ilike("team_name", `%${q}%`)
        .limit(200);
      if (error) throw new Error(`Ask: ${name} (${error.code ?? "?"})`);
      const all = (data ?? []) as TeamSeasonStatsRow[];
      if (all.length === 0) return empty(t.teamStats);

      // Stagione in corso: gli id non sono in ordine di tempo (lo storico è stato caricato
      // dopo), quindi si guarda la data d'inizio di ogni stagione.
      const { data: seasonData } = await supabase
        .from("seasons")
        .select("id, label, start_date, competitions!seasons_competition_id_fkey(name)")
        .in("id", [...new Set(all.map((r) => r.season_id))]);
      const seasons = new Map(
        (
          (seasonData ?? []) as unknown as {
            id: number;
            label: string;
            start_date: string;
            competitions: { name: string } | null;
          }[]
        ).map((x) => [x.id, x]),
      );
      const rows = currentSeasonRows(all, (r) => seasons.get(r.season_id)?.start_date ?? null);

      const teamIds = [...new Set(rows.map((r) => r.team_id))];
      const seasonIds = [...new Set(rows.map((r) => r.season_id))];
      const key = (teamId: number, seasonId: number) => `${teamId}|${seasonId}`;
      const [{ data: f }, { data: st }] = await Promise.all([
        supabase.from("v_team_form").select("*").in("team_id", teamIds).in("season_id", seasonIds),
        supabase
          .from("v_latest_standings")
          .select("*")
          .eq("standing_type", "TOTAL")
          .in("team_id", teamIds)
          .in("season_id", seasonIds),
      ]);
      const forms = new Map(
        ((f ?? []) as TeamFormRow[]).map((row) => [key(row.team_id, row.season_id), row.form]),
      );
      const positions = new Map(
        ((st ?? []) as StandingRow[]).map((row) => [key(row.team_id, row.season_id), row]),
      );
      return {
        tool: name,
        title: t.teamStats,
        source: "football-data.org",
        rows: rows.map((r) => {
          const season = seasons.get(r.season_id);
          const standing = positions.get(key(r.team_id, r.season_id));
          return {
            [t.team]: r.team_name,
            [t.competition]: season?.competitions?.name ?? "–",
            [t.season]: season?.label ?? "–",
            ...(standing ? { [t.position]: String(standing.position) } : {}),
            [t.played]: String(r.played),
            [t.wdl]: `${r.won}-${r.draw}-${r.lost}`,
            [t.goals]: `${r.goals_for}-${r.goals_against}`,
            [t.points]: String(r.points),
            [t.home]: `${r.home_played} ${t.playedShort}, ${r.home_won} ${t.wonShort}, ${r.home_goals_for}-${r.home_goals_against}`,
            [t.away]: `${r.away_played} ${t.playedShort}, ${r.away_won} ${t.wonShort}, ${r.away_goals_for}-${r.away_goals_against}`,
            [t.over25]: String(r.over_2_5),
            [t.btts]: String(r.both_scored),
            [t.form]: forms.get(key(r.team_id, r.season_id)) ?? "–",
          };
        }),
      };
    }

    case "partite_campionato": {
      const q = s(args.campionato);
      if (q.length < 2) return empty(t.matches);
      const upcoming = args.tipo !== "giocate";
      let query = supabase.from("v_match_center").select("*").ilike("competition_name", `%${q}%`);
      query = upcoming
        ? query
            .eq("status", "SCHEDULED")
            .gte("kickoff_at", new Date().toISOString())
            .order("kickoff_at")
        : query.eq("status", "FINISHED").order("kickoff_at", { ascending: false });
      const { data, error } = await query.limit(12);
      if (error) throw new Error(`Ask: ${name} (${error.code ?? "?"})`);
      const rows = (data ?? []) as MatchCenterRow[];
      return {
        tool: name,
        title: rows[0] ? `${t.matches}: ${rows[0].competition_name}` : t.matches,
        source: rows[0] ? `${rows[0].provider_name}` : null,
        rows: rows.map((r) => ({
          match_id: String(r.match_id),
          [t.date]: formatDateTime(r.kickoff_at),
          [t.match]: `${team(r.home_team_name, r.home_team_short_name)} – ${team(r.away_team_name, r.away_team_short_name)}`,
          ...(r.home_score !== null && r.away_score !== null
            ? { [t.score]: `${r.home_score}-${r.away_score}` }
            : {}),
        })),
      };
    }

    case "giocate_piu_probabili": {
      const picks = (await loadHomeCertainties()).slice(0, 12);
      return {
        tool: name,
        title: t.certainties,
        source: picks.length > 0 ? t.certaintiesSource : null,
        rows: picks.map((p) => ({
          match_id: String(p.matchId),
          [t.date]: formatDateTime(p.kickoffAt),
          [t.match]: `${p.home} – ${p.away}`,
          [t.pick]: pickLabel(p),
          [t.probability]: formatPercent(p.probability, 0),
        })),
      };
    }

    case "classifica": {
      const q = s(args.campionato);
      if (q.length < 2) return empty(t.standings);
      const { data, error } = await supabase
        .from("v_latest_standings")
        .select("*")
        .eq("standing_type", "TOTAL")
        .ilike("competition_name", `%${q}%`)
        .order("season_label", { ascending: false })
        .order("position")
        .limit(40);
      if (error) throw new Error(`Ask: ${name} (${error.code ?? "?"})`);
      const all = (data ?? []) as StandingRow[];
      // Una sola competizione e la sua stagione più recente (es. "Serie A", non anche "Serie B").
      const first = all[0];
      const rows = all.filter(
        (r) => r.season_id === first?.season_id && r.competition_id === first?.competition_id,
      );
      return {
        tool: name,
        title: rows[0]
          ? `${t.standings}: ${rows[0].competition_name} ${rows[0].season_label}`
          : t.standings,
        source: rows[0]
          ? `football-data.org · ${t.observed} ${formatDateTime(rows[0].observed_at)}`
          : null,
        rows: rows.map((r) => ({
          [t.position]: String(r.position),
          [t.team]: r.team_name,
          [t.points]: String(r.points),
          [t.played]: String(r.played),
          [t.wdl]: `${r.won}-${r.draw}-${r.lost}`,
          [t.goals]: `${r.goals_for}-${r.goals_against}`,
        })),
      };
    }

    case "modello_attivo": {
      const { data, error } = await supabase
        .from("v_model_versions_summary")
        .select("*")
        .eq("status", "ACTIVE")
        .limit(1);
      if (error) throw new Error(`Ask: ${name} (${error.code ?? "?"})`);
      const r = (data ?? [])[0] as ModelVersionSummaryRow | undefined;
      if (!r) return empty(t.model);
      return {
        tool: name,
        title: `${t.model}: ${r.model_key}`,
        source: `${t.version} ${r.version}`,
        rows: [
          {
            [t.trainingMatches]: String(r.training_matches),
            Brier: formatDecimal(r.brier, 3),
            [t.baselineBrier]: formatDecimal(r.baseline_brier, 3),
            [t.beatsBaseline]: r.beats_baseline === null ? "–" : r.beats_baseline ? t.yes : t.no,
          },
        ],
      };
    }

    case "proposte": {
      const { data, error } = await supabase
        .from("v_active_bet_proposals")
        .select("*")
        .eq("rank", 1)
        .limit(3);
      if (error) throw new Error(`Ask: ${name} (${error.code ?? "?"})`);
      const rows = (data ?? []) as ActiveBetProposalRow[];
      return {
        tool: name,
        title: t.proposals,
        source: rows[0] ? `${t.model} ${rows[0].model_key} ${rows[0].model_version}` : null,
        rows: rows.map((r) => ({
          [t.category]: m.betBuilder.categories[r.category] ?? r.category,
          [t.legs]: String(r.legs_count),
          [t.probability]: formatPercent(Number(r.probability)),
          [t.price]: formatOdds(Number(r.combined_price)),
          [t.expectedValue]: formatPercent(Number(r.expected_value)),
        })),
      };
    }

    case "guida_app":
      return {
        tool: name,
        title: t.guide,
        source: t.guideSource,
        rows: m.ask.guide.map((g) => ({
          [t.guideSection]: g.section,
          [t.guidePage]: g.page,
          [t.guideWhere]: g.where,
          [t.guideWhat]: g.what,
        })),
      };
    default:
      return empty(t.unknown);
  }
}
