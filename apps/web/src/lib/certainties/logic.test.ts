import { describe, expect, it } from "vitest";
import type { ActivePredictionRow } from "@predictra/shared-types";
import {
  bandStats,
  buildMultiple,
  buildValueMultiple,
  flatReturn,
  combinedProbability,
  DEFAULT_THRESHOLD,
  groupByMatch,
  parseThreshold,
  pastMultiples,
  selectPicks,
  settle,
} from "./logic";

const row = (over: Partial<ActivePredictionRow>): ActivePredictionRow => ({
  match_id: 1,
  kickoff_at: "2026-11-20T20:00:00Z",
  match_status: "SCHEDULED",
  competition_id: 1,
  season_id: 1,
  home_team_name: "DEMO Casa",
  away_team_name: "DEMO Ospite",
  market: "1X2",
  line: null,
  selection: "HOME",
  probability: 0.5,
  push_probability: null,
  confidence_score: 0.5,
  explanation: {},
  as_of: "2026-11-19T12:00:00Z",
  created_at: "2026-11-19T12:00:00Z",
  model_version_id: 1,
  model_key: "dixon_coles",
  model_version: "1",
  ...over,
});

describe("parseThreshold", () => {
  it("accetta solo le soglie previste", () => {
    expect(parseThreshold("80")).toBe(0.8);
    expect(parseThreshold(["90"])).toBe(0.9);
    expect(parseThreshold("77")).toBe(DEFAULT_THRESHOLD);
    expect(parseThreshold(undefined)).toBe(DEFAULT_THRESHOLD);
  });
});

describe("selectPicks", () => {
  it("tiene le selezioni sopra soglia e toglie i doppioni implicati", () => {
    const picks = selectPicks(
      [
        row({ market: "1X2", selection: "HOME", probability: 0.78 }),
        row({ market: "DOUBLE_CHANCE", selection: "HOME_DRAW", probability: 0.9 }),
        row({ market: "DOUBLE_CHANCE", selection: "HOME_AWAY", probability: 0.85 }),
        row({ market: "TOTAL_GOALS", line: 0.5, selection: "OVER", probability: 0.95 }),
        row({ market: "TOTAL_GOALS", line: 1.5, selection: "OVER", probability: 0.8 }),
        row({ market: "TOTAL_GOALS", line: 2.0, selection: "OVER", probability: 0.76 }),
        row({ market: "TOTAL_GOALS", line: 4.5, selection: "UNDER", probability: 0.92 }),
        row({ market: "TOTAL_GOALS", line: 3.5, selection: "UNDER", probability: 0.76 }),
        row({ market: "BTTS", selection: "NO", probability: 0.6 }),
        row({ market: "CORRECT_SCORE", selection: "OTHER", probability: 0.9 }),
      ],
      0.75,
    );
    expect(picks.map((p) => `${p.market}:${p.line ?? ""}:${p.selection}`)).toEqual([
      "TOTAL_GOALS:1.5:OVER",
      "1X2::HOME",
      "TOTAL_GOALS:3.5:UNDER",
    ]);
  });

  it("raggruppa per partita in ordine di calcio d'inizio", () => {
    const picks = selectPicks(
      [
        row({ match_id: 2, kickoff_at: "2026-11-21T20:00:00Z", probability: 0.8 }),
        row({ match_id: 1, probability: 0.8 }),
      ],
      0.75,
    );
    expect(groupByMatch(picks).map((g) => g.matchId)).toEqual([1, 2]);
  });
});

describe("settle", () => {
  it("risolve i mercati secchi dal risultato", () => {
    expect(settle("1X2", null, "HOME", 2, 1)).toBe(true);
    expect(settle("DOUBLE_CHANCE", null, "DRAW_AWAY", 1, 1)).toBe(true);
    expect(settle("DOUBLE_CHANCE", null, "HOME_AWAY", 1, 1)).toBe(false);
    expect(settle("TOTAL_GOALS", 2.5, "UNDER", 1, 1)).toBe(true);
    expect(settle("BTTS", null, "YES", 1, 0)).toBe(false);
    expect(settle("TEAM_GOALS", 0.5, "AWAY_OVER", 0, 1)).toBe(true);
    expect(settle("ASIAN_HANDICAP", 0.5, "HOME", 1, 0)).toBeNull();
  });
});

describe("bandStats", () => {
  it("conta uscite e probabilità media per fascia", () => {
    const stats = bandStats(
      [
        row({ match_id: 1, probability: 0.81 }),
        row({ match_id: 2, probability: 0.83 }),
        row({ match_id: 3, probability: 0.95 }),
        row({ match_id: 4, probability: 0.95 }),
      ],
      new Map([
        [1, { home: 2, away: 0 }],
        [2, { home: 0, away: 0 }],
        [3, { home: 1, away: 0 }],
      ]),
    );
    const band80 = stats.find((s) => s.from === 0.8)!;
    expect(band80.count).toBe(2);
    expect(band80.wins).toBe(1);
    expect(band80.observed).toBe(0.5);
    expect(band80.predicted).toBeCloseTo(0.82);
    expect(stats.at(-1)!.count).toBe(1);
    expect(stats[0]!.observed).toBeNull();
  });
});

describe("probabilità combinata modello/mercato", () => {
  it("usa la media con il mercato quando ci sono quote, e filtra su quella", () => {
    const market = (r: ActivePredictionRow) => (r.match_id === 1 ? 0.6 : null);
    const picks = selectPicks(
      [row({ match_id: 1, probability: 0.8 }), row({ match_id: 2, probability: 0.8 })],
      0.75,
      market,
    );
    expect(picks.map((p) => p.matchId)).toEqual([2]);
    expect(combinedProbability(0.8, 0.9)).toBeCloseTo(0.85);
    expect(combinedProbability(0.8, null)).toBe(0.8);
  });

  it("verifica per fascia sulla probabilità combinata", () => {
    const stats = bandStats(
      [row({ match_id: 1, probability: 0.8 })],
      new Map([[1, { home: 1, away: 0 }]]),
      () => 0.9,
    );
    expect(stats.find((s) => s.from === 0.85)!.count).toBe(1);
  });
});

describe("buildMultiple", () => {
  const pick = (matchId: number, probability: number) =>
    selectPicks([row({ match_id: matchId, probability })], 0)[0]!;

  it("aggiunge le giocate più forti finché la probabilità resta sopra la soglia", () => {
    const multiple = buildMultiple([pick(1, 0.95), pick(2, 0.9), pick(3, 0.85), pick(4, 0.8)], 0.7);
    // 0,95 × 0,90 × 0,85 = 0,727; con la quarta (0,80) scenderebbe a 0,581.
    expect(multiple!.picks.map((p) => p.matchId)).toEqual([1, 2, 3]);
    expect(multiple!.probability).toBeCloseTo(0.72675);
  });

  it("una sola giocata per partita e almeno due partite", () => {
    expect(buildMultiple([pick(1, 0.95), pick(1, 0.9)], 0.5)).toBeNull();
  });
});

describe("pastMultiples", () => {
  it("ricostruisce le multiple per settimana e ne calcola l'esito", () => {
    const rows = [
      row({ match_id: 1, kickoff_at: "2026-11-07T15:00:00Z", probability: 0.9 }),
      row({ match_id: 2, kickoff_at: "2026-11-08T15:00:00Z", probability: 0.88 }),
      row({ match_id: 3, kickoff_at: "2026-11-14T15:00:00Z", probability: 0.9 }),
      row({ match_id: 4, kickoff_at: "2026-11-15T15:00:00Z", probability: 0.9 }),
    ];
    const results = new Map([
      [1, { home: 1, away: 0 }],
      [2, { home: 2, away: 0 }],
      [3, { home: 1, away: 0 }],
      [4, { home: 0, away: 1 }],
    ]);
    const past = pastMultiples(rows, results, 0.75).filter((m) => m.target === 0.7);
    expect(past.map((m) => [m.week, m.legs, m.won])).toEqual([
      ["2026-11-02", 2, true],
      ["2026-11-09", 2, false],
    ]);
  });
});

describe("multipla con valore", () => {
  const pick = (matchId: number, probability: number) =>
    selectPicks([row({ match_id: matchId, probability })], 0)[0]!;

  it("usa solo giocate con quota sopra il giusto e resta sopra il traguardo", () => {
    const prices = new Map([
      [1, 1.2], // 0,90 × 1,20 = 1,08: conviene
      [2, 1.1], // 0,85 × 1,10 = 0,935: non conviene
      [3, 1.4], // 0,80 × 1,40 = 1,12: conviene
      [4, 1.6], // 0,65 × 1,60 = 1,04: conviene, ma la multipla scenderebbe al 46,8%
    ]);
    const m = buildValueMultiple(
      [pick(1, 0.9), pick(2, 0.85), pick(3, 0.8), pick(4, 0.65)],
      (p) => prices.get(p.matchId) ?? null,
    );
    expect(m!.picks.map((p) => p.matchId)).toEqual([1, 3]);
    expect(m!.probability).toBeCloseTo(0.72);
    expect(m!.price).toBeCloseTo(1.68);
    expect(m!.value).toBeCloseTo(0.2096);
  });

  it("rendimento a puntata fissa", () => {
    expect(
      flatReturn([
        { won: true, price: 3 },
        { won: false, price: 2 },
      ]),
    ).toBeCloseTo(0.5);
    expect(flatReturn([])).toBeNull();
  });
});

describe("giocate utili", () => {
  it("niente linee estreme né gol squadra, al massimo 3 per partita", () => {
    const picks = selectPicks(
      [
        row({ market: "TOTAL_GOALS", line: 0.5, selection: "OVER", probability: 0.95 }),
        row({ market: "TOTAL_GOALS", line: 4.5, selection: "UNDER", probability: 0.9 }),
        row({ market: "TEAM_GOALS", line: 0.5, selection: "HOME_OVER", probability: 0.9 }),
        row({ market: "DOUBLE_CHANCE", selection: "HOME_DRAW", probability: 0.88 }),
        row({ market: "DOUBLE_CHANCE", selection: "HOME_AWAY", probability: 0.8 }),
        row({ market: "TOTAL_GOALS", line: 3.5, selection: "UNDER", probability: 0.78 }),
        row({ market: "BTTS", selection: "NO", probability: 0.76 }),
      ],
      0.75,
    );
    expect(picks.map((p) => `${p.market}:${p.selection}`)).toEqual([
      "DOUBLE_CHANCE:HOME_DRAW",
      "DOUBLE_CHANCE:HOME_AWAY",
      "TOTAL_GOALS:UNDER",
    ]);
  });
});
