import { describe, expect, it } from "vitest";
import { formatStat, humanize, sortPlayers, statRows } from "./details";

describe("statistiche e formazioni (valori DEMO)", () => {
  it("una riga per voce, casa e trasferta, nell'ordine di lettura", () => {
    const rows = statRows(
      [
        { team_id: 1, stat: "fouls", value: 12 },
        { team_id: 2, stat: "fouls", value: 9 },
        { team_id: 1, stat: "ball_possession", value: 58 },
        { team_id: 2, stat: "ball_possession", value: 42 },
        { team_id: 1, stat: "zz_nuova_voce", value: 1 },
        { team_id: 2, stat: "red_cards", value: null },
        { team_id: 1, stat: "red_cards", value: null },
        { team_id: 3, stat: "fouls", value: 99 },
      ],
      1,
      2,
    );
    expect(rows).toEqual([
      { stat: "ball_possession", home: 58, away: 42 },
      { stat: "fouls", home: 12, away: 9 },
      { stat: "zz_nuova_voce", home: 1, away: null },
    ]);
  });

  it("titolari dal portiere in avanti, panchina per numero", () => {
    const p = (name: string, starter: boolean, grid: string | null, n: number | null) => ({
      name,
      is_starter: starter,
      grid,
      shirt_number: n,
    });
    const { starters, bench } = sortPlayers([
      p("att", true, "4:1", 9),
      p("dif2", true, "2:2", 3),
      p("por", true, "1:1", 1),
      p("dif1", true, "2:1", 2),
      p("pan2", false, null, 22),
      p("pan1", false, null, 12),
      p("panX", false, null, null),
    ]);
    expect(starters.map((x) => x.name)).toEqual(["por", "dif1", "dif2", "att"]);
    expect(bench.map((x) => x.name)).toEqual(["pan1", "pan2", "panX"]);
  });

  it("formati dei valori", () => {
    expect(formatStat("ball_possession", 58)).toBe("58%");
    expect(formatStat("expected_goals", 1.25)).toBe("1,25");
    expect(formatStat("expected_goals", 1.5)).toBe("1,5");
    expect(formatStat("fouls", 12)).toBe("12");
    expect(formatStat("fouls", null)).toBe("–");
    expect(humanize("shots_insidebox")).toBe("Shots insidebox");
  });
});
