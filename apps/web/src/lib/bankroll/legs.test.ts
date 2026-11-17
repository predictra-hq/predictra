import { describe, expect, it } from "vitest";
import { encodeLegs, outcomeOfLegs, parseLegs, type MatchOutcome } from "./legs";

const picks = [
  { matchId: 1, market: "1X2", line: null, selection: "HOME" },
  { matchId: 2, market: "TOTAL_GOALS", line: 2.5, selection: "OVER" },
];

describe("selezioni di una giocata", () => {
  it("si scrivono nel link e si rileggono uguali", () => {
    const text = encodeLegs(picks);
    expect(text).toBe("1:1X2::HOME;2:TOTAL_GOALS:2.5:OVER");
    expect(parseLegs(text)).toEqual([
      { m: 1, k: "1X2", l: null, s: "HOME" },
      { m: 2, k: "TOTAL_GOALS", l: 2.5, s: "OVER" },
    ]);
  });

  it("rifiuta testi non validi, mercati non chiudibili e partite ripetute", () => {
    expect(parseLegs("1:1X2::HOME;1:BTTS::YES")).toBeNull();
    expect(parseLegs("1:CORRECT_SCORE::OTHER")).toBeNull();
    expect(parseLegs("x:1X2::HOME")).toBeNull();
    expect(parseLegs("")).toBeNull();
    expect(
      encodeLegs([{ matchId: 1, market: "ASIAN_HANDICAP", line: 0.5, selection: "HOME" }]),
    ).toBeNull();
  });
});

describe("chiusura automatica", () => {
  const legs = parseLegs(encodeLegs(picks))!;
  const done = (home: number, away: number): MatchOutcome => ({ status: "FINISHED", home, away });

  it("vinta solo quando tutte le partite sono finite e giuste", () => {
    expect(
      outcomeOfLegs(
        legs,
        new Map([
          [1, done(2, 0)],
          [2, done(2, 1)],
        ]),
      ),
    ).toBe("WON");
    expect(outcomeOfLegs(legs, new Map([[1, done(2, 0)]]))).toBeNull();
  });

  it("persa appena una selezione è sbagliata, anche se le altre non sono finite", () => {
    expect(outcomeOfLegs(legs, new Map([[1, done(0, 1)]]))).toBe("LOST");
  });

  it("partita rinviata: resta aperta, decide l'utente", () => {
    const results = new Map<number, MatchOutcome>([
      [1, done(2, 0)],
      [2, { status: "POSTPONED", home: null, away: null }],
    ]);
    expect(outcomeOfLegs(legs, results)).toBeNull();
  });
});
