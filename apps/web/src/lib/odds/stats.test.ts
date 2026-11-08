import type { TeamSeasonStatsRow } from "@predictra/shared-types";
import { describe, expect, it } from "vitest";
import { formPoints, homeAdvantage, parseForm, perMatch, rate, sortTeamStats } from "./stats";

describe("medie e percentuali", () => {
  it("per partita e frazioni, null senza partite", () => {
    expect(perMatch(15, 10)).toBe(1.5);
    expect(perMatch(3, 0)).toBeNull();
    expect(rate(4, 10)).toBe(0.4);
    expect(rate(0, 0)).toBeNull();
  });
});

describe("forma recente", () => {
  it("legge V/N/P e calcola i punti", () => {
    expect(parseForm("VVNPV")).toEqual(["V", "V", "N", "P", "V"]);
    expect(parseForm("V?x N")).toEqual(["V", "N"]);
    expect(parseForm(null)).toEqual([]);
    expect(formPoints(parseForm("VVNPV"))).toBe(10);
    expect(formPoints([])).toBe(0);
  });
});

describe("classifica calcolata dai risultati", () => {
  const row = (team_id: number, team_name: string, points: number, gf: number, ga: number) =>
    ({ team_id, team_name, points, goals_for: gf, goals_against: ga }) as TeamSeasonStatsRow;

  it("punti, poi differenza reti, poi gol fatti, poi nome", () => {
    const sorted = sortTeamStats([
      row(1, "Beta", 20, 20, 10),
      row(2, "Alfa", 20, 20, 10),
      row(3, "Gamma", 20, 25, 10),
      row(4, "Delta", 23, 10, 15),
      row(5, "Epsilon", 20, 18, 8),
    ]);
    expect(sorted.map((r) => r.team_id)).toEqual([4, 3, 2, 1, 5]);
  });
});

describe("vantaggio casalingo", () => {
  it("differenze tra casa e trasferta", () => {
    const adv = homeAdvantage({
      matches: 100,
      avg_home_goals: 1.55,
      avg_away_goals: 1.2,
      home_win_rate: 0.45,
      draw_rate: 0.25,
      away_win_rate: 0.3,
    })!;
    expect(adv.goals).toBeCloseTo(0.35, 9);
    expect(adv.winRate).toBeCloseTo(0.15, 9);
    expect(adv.homePoints).toBeCloseTo(1.6, 9);
    expect(adv.awayPoints).toBeCloseTo(1.15, 9);
  });

  it("null senza partite", () => {
    expect(
      homeAdvantage({
        matches: 0,
        avg_home_goals: 0,
        avg_away_goals: 0,
        home_win_rate: 0,
        draw_rate: 0,
        away_win_rate: 0,
      }),
    ).toBeNull();
  });
});
