import type { MatchCenterRow } from "@predictra/shared-types";
import { describe, expect, it } from "vitest";
import { containsPattern, parseSearch, recentForm, teamMatchView } from "./team";

const row = (over: Partial<MatchCenterRow>): MatchCenterRow =>
  ({
    match_id: 1,
    kickoff_at: "2026-11-01T14:00:00Z",
    competition_name: "Serie A",
    home_team_id: 10,
    home_team_name: "Casa FC",
    home_team_short_name: "Casa",
    away_team_id: 20,
    away_team_name: "Ospiti FC",
    away_team_short_name: null,
    home_score: null,
    away_score: null,
    ...over,
  }) as MatchCenterRow;

describe("partita vista da una squadra", () => {
  it("in casa: avversario e gol dal proprio lato", () => {
    const v = teamMatchView(row({ home_score: 2, away_score: 1 }), 10);
    expect(v).toMatchObject({
      isHome: true,
      opponentId: 20,
      opponentName: "Ospiti FC",
      goalsFor: 2,
      goalsAgainst: 1,
      outcome: "V",
    });
  });

  it("in trasferta: stessa partita, esito opposto", () => {
    const v = teamMatchView(row({ home_score: 2, away_score: 1 }), 20);
    expect(v).toMatchObject({ isHome: false, opponentName: "Casa", outcome: "P" });
  });

  it("pareggio e partita non giocata", () => {
    expect(teamMatchView(row({ home_score: 0, away_score: 0 }), 10).outcome).toBe("N");
    expect(teamMatchView(row({}), 10).outcome).toBeNull();
  });
});

describe("forma recente", () => {
  it("solo partite giocate, al più n", () => {
    const views = [
      teamMatchView(row({}), 10),
      teamMatchView(row({ home_score: 1, away_score: 0 }), 10),
      teamMatchView(row({ home_score: 0, away_score: 3 }), 10),
      teamMatchView(row({ home_score: 1, away_score: 1 }), 10),
    ];
    expect(recentForm(views)).toEqual(["V", "P", "N"]);
    expect(recentForm(views, 2)).toEqual(["V", "P"]);
  });
});

describe("ricerca", () => {
  it("serve un testo di almeno due caratteri", () => {
    expect(parseSearch(undefined)).toBeNull();
    expect(parseSearch(["a", "b"])).toBeNull();
    expect(parseSearch(" a ")).toBeNull();
    expect(parseSearch("  inter   milan ")).toBe("inter milan");
  });

  it("i jolly di Postgres e i separatori dei filtri non passano", () => {
    expect(containsPattern("inter")).toBe("%inter%");
    expect(containsPattern("100%_a\\")).toBe("%100\\%\\_a\\\\%");
    expect(containsPattern("a,b(c)")).toBe("%a b c %");
  });
});
