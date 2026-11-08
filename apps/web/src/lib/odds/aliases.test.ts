import { describe, expect, it } from "vitest";
import {
  buildAliasIndex,
  namesToMap,
  normalizeTeamName,
  parseUnmatchedIssue,
  resolveAlias,
  suggestTeam,
} from "./aliases";

/* Nomi usati solo come input dei test: non sono dati raccolti né alias da salvare. */

describe("normalizzazione dei nomi", () => {
  it("come app_private.normalize_team_name: trim, spazi singoli, minuscolo", () => {
    expect(normalizeTeamName("  Inter   Milan ")).toBe("inter milan");
    expect(normalizeTeamName("AC\tMilan")).toBe("ac milan");
  });
});

describe("risoluzione degli alias", () => {
  const index = buildAliasIndex([
    { team_id: 1, normalized_alias: "squadra uno" },
    { team_id: 1, normalized_alias: "uno fc" },
    { team_id: 2, normalized_alias: "doppio" },
    { team_id: 3, normalized_alias: "doppio" },
  ]);

  it("nota, ambigua o mancante", () => {
    expect(resolveAlias("Squadra  Uno", index)).toEqual({ status: "known", teamId: 1 });
    expect(resolveAlias("Doppio", index)).toEqual({ status: "ambiguous", teamIds: [2, 3] });
    expect(resolveAlias("Sconosciuta", index)).toEqual({ status: "missing" });
  });

  it("nomi da abbinare: uno per nome, mancanti prima, con il numero di eventi", () => {
    const events = [
      { a: "Squadra Uno", b: "Nuova Squadra", c: "SA" },
      { a: "Nuova Squadra", b: "Altra", c: "SA" },
      { a: "nuova  squadra", b: "Squadra Uno", c: "CL" },
    ].map((e, i) => ({
      issueId: i,
      providerEventId: `ev${i}`,
      homeTeam: e.a,
      awayTeam: e.b,
      commenceTime: null,
      competitionCode: e.c,
      lastSeenAt: "2026-11-08T07:23:00Z",
    }));
    const names = namesToMap(events, index);
    expect(names.map((n) => [n.name, n.events, n.resolution.status])).toEqual([
      ["Nuova Squadra", 3, "missing"],
      ["Altra", 1, "missing"],
      ["Squadra Uno", 2, "known"],
    ]);
    expect(names[0]!.competitionCodes).toEqual(["SA", "CL"]);
  });
});

describe("lettura dei problemi odds.event_unmatched", () => {
  it("estrae i nomi ricevuti e scarta i dettagli incompleti", () => {
    const parsed = parseUnmatchedIssue({
      id: 7,
      provider_entity_id: "abc",
      last_seen_at: "2026-11-08T07:23:00Z",
      details: {
        home_team: "Casa",
        away_team: "Ospite",
        commence_time: "2026-11-09T19:45:00Z",
        competition_code: "SA",
      },
    });
    expect(parsed).toMatchObject({
      issueId: 7,
      homeTeam: "Casa",
      awayTeam: "Ospite",
      competitionCode: "SA",
    });
    for (const details of [{}, null, { home_team: "Casa" }, { home_team: 1, away_team: "X" }]) {
      expect(
        parseUnmatchedIssue({ id: 1, provider_entity_id: null, last_seen_at: "", details }),
      ).toBeNull();
    }
  });
});

describe("suggerimento della squadra", () => {
  const candidates = [
    { id: 1, name: "FC Internazionale Milano", short_name: "Inter" },
    { id: 2, name: "AC Milan", short_name: "Milan" },
    { id: 3, name: "SSC Napoli", short_name: "Napoli" },
    { id: 4, name: "Atlético de Madrid", short_name: "Atleti" },
  ];

  it("la squadra con più parole in comune, senza accenti e sigle", () => {
    expect(suggestTeam("Inter Milan", candidates)?.id).toBeUndefined(); // pari merito: nessuno
    expect(suggestTeam("Inter", candidates)?.id).toBe(1);
    expect(suggestTeam("Napoli", candidates)?.id).toBe(3);
    expect(suggestTeam("Atletico Madrid", candidates)?.id).toBe(4);
  });

  it("nessun suggerimento senza parole in comune", () => {
    expect(suggestTeam("Juventus", candidates)).toBeNull();
    expect(suggestTeam("FC", candidates)).toBeNull();
  });
});
